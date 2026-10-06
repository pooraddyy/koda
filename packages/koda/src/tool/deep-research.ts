import * as Tool from "./tool"
import DESCRIPTION from "./deep-research.txt"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { TaskPromptOps } from "./task"
import { Config } from "@/config/config"
import { Effect, Schema, Scope } from "effect"
import { Database } from "@koda-ai/core/database/database"

const id = "deep_research"

export const Parameters = Schema.Struct({
  topic: Schema.String.annotate({ description: "The topic or question to research in depth" }),
  breadth: Schema.optional(Schema.Int).annotate({
    description: "Number of different angles to explore (default: 3, max: 10)",
  }),
  depth: Schema.optional(Schema.Int).annotate({
    description: "How deep to go with follow-up research (default: 2, max: 3)",
  }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "Run research in the background. You will be notified when it completes.",
  }),
})

function buildPrompt(topic: string, breadth: number, depth: number): string {
  return `Conduct deep research on the following topic: "${topic}"

Research parameters:
- Breadth: ${breadth} (explore ${breadth} different angles/aspects)
- Depth: ${depth} (follow up ${depth} levels deep on interesting threads)

Follow your research protocol:
1. Generate ${breadth} diverse search queries covering different angles
2. Use websearch for each query (5-8 results each)
3. Use webfetch to extract content from the most promising sources
4. Identify key learnings, facts, metrics, and entities
5. If depth > 1, generate follow-up questions and research deeper
6. Synthesize everything into a comprehensive markdown report with a Sources section

Return the complete report as your final response.`
}

export const DeepResearchTool = Tool.define(
  id,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const database = yield* Database.Service
    const agent = yield* Agent.Service

    const run = Effect.fn("DeepResearchTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const breadth = params.breadth ?? 3
      const depth = params.depth ?? 2
      const runInBackground = params.background === true

      const research = yield* agent.get("research")
      if (!research) {
        return yield* Effect.fail(new Error("Research agent not found"))
      }

      const parent = yield* sessions.get(ctx.sessionID)
      const childPermission = deriveSubagentSessionPermission({
        parentSessionPermission: parent.permission ?? [],
        subagent: research,
      })

      const nextSession = yield* sessions.create({
        parentID: ctx.sessionID,
        title: `Deep research: ${params.topic.slice(0, 50)}`,
        agent: research.name,
        permission: childPermission,
      })

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      const model = research.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("DeepResearchTool requires promptOps in ctx.extra"))

      const prompt = buildPrompt(params.topic, breadth, depth)

      if (runInBackground) {
        const parts = yield* ops.resolvePromptParts(prompt)
        yield* ops
          .prompt({
            messageID: MessageID.ascending(),
            sessionID: nextSession.id,
            model: { modelID: model.modelID, providerID: model.providerID },
            agent: research.name,
            parts,
          })
          .pipe(Effect.forkIn(scope))
        return {
          title: `Deep research: ${params.topic.slice(0, 50)}`,
          metadata: {},
          output: `Deep research started in the background (session: ${nextSession.id}). You will be notified when it completes.`,
        }
      }

      const parts = yield* ops.resolvePromptParts(prompt)
      const result = yield* ops.prompt({
        messageID: MessageID.ascending(),
        sessionID: nextSession.id,
        model: { modelID: model.modelID, providerID: model.providerID },
        agent: research.name,
        parts,
      })
      return {
        title: `Deep research: ${params.topic.slice(0, 50)}`,
        metadata: {},
        output: result.parts.findLast((item) => item.type === "text")?.text ?? "No results",
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
