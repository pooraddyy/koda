import { Effect, Option, Schema } from "effect"
import { Tool } from "@/tool/tool"
import { TaskTool } from "@/tool/task"
import { Config } from "@/config/config"
import { Service as LifecycleHooks } from "@/koda/hooks/service"
import { CollaborationCoordinator } from "@/koda/orchestration/service"
import { COLLABORATION_MODES, planCollaboration } from "@/koda/orchestration/modes"

const id = "collaborate"

export const Parameters = Schema.Struct({
  request: Schema.String.annotate({ description: "The outcome to deliver with coordinated specialist agents" }),
  mode: Schema.optional(Schema.Literals(["focused", "parallel", "review", "thorough"])),
  description: Schema.optional(Schema.String),
})

function agentForRole(role: string) {
  if (["scout", "architect", "verifier", "reviewer"].includes(role)) return "explore"
  return "general"
}

function graphID(sessionID: string) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12)
  return `collab-${String(sessionID)
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(-20)}-${suffix}`.slice(0, 64)
}

export const CollaborateTool = Tool.define(
  id,
  Effect.gen(function* () {
    const coordinator = yield* CollaborationCoordinator.Service
    const config = yield* Config.Service
    const task = yield* TaskTool
    const taskDefinition = yield* task.init()
    const hooks = Option.getOrUndefined(yield* Effect.serviceOption(LifecycleHooks))

    return {
      description:
        "Run a durable, dependency-aware Koda collaboration graph. Use focused for a small change, parallel for discovery plus implementation, review for audits, and thorough for a full implementation pipeline.",
      parameters: Parameters,
      execute: Effect.fn("CollaborateTool.execute")(function* (params, ctx) {
        const cfg = yield* config.get()
        if (cfg.collaboration?.enabled !== true) {
          return {
            title: "Collaboration disabled",
            output: 'Collaboration is disabled. Set "collaboration.enabled": true in Koda configuration to enable it.',
            metadata: { collaborationError: "disabled" },
          }
        }
        const selectedMode = params.mode ?? cfg.collaboration?.mode ?? "focused"
        const description = params.description ?? "Koda collaboration"
        const mode = COLLABORATION_MODES[selectedMode]
        const maxConcurrency = Math.max(1, Math.min(16, cfg.collaboration?.max_concurrency ?? mode.maxConcurrency))
        const retries = Math.max(0, Math.min(2, cfg.collaboration?.retries ?? mode.retries))
        const planned = planCollaboration(selectedMode, params.request)
        const maxNodes = cfg.collaboration?.max_nodes ?? mode.maxNodes
        if (planned.length > maxNodes) {
          return {
            title: "Collaboration limit reached",
            output: `Collaboration mode ${selectedMode} requires ${planned.length} nodes, above configured max_nodes ${maxNodes}.`,
            metadata: { collaborationError: "max_nodes" },
          }
        }
        const nodes = planned.map((node) => ({
          ...node,
          maxAttempts: Math.max(1, Math.min(3, retries + 1)),
          mutation: node.mutation && !mode.allowMutationParallelism,
        }))
        const id = graphID(ctx.sessionID)
        yield* ctx.metadata({ title: description, metadata: { graphID: id, mode: selectedMode } })
        const graph = yield* coordinator.create({
          id,
          rootSessionID: ctx.sessionID,
          mode: selectedMode,
          maxConcurrency,
          nodes,
        })

        const result = yield* coordinator.execute(id, (node) =>
          Effect.gen(function* () {
            if (hooks) {
              const gate = yield* hooks.run({
                event: "graph.node",
                timestamp: Date.now(),
                sessionID: String(ctx.sessionID),
                graphID: id,
                nodeID: node.id,
                data: { state: "starting", role: node.role, attempt: node.attempts },
              })
              if (!gate.allowed) return yield* Effect.fail(new Error(`Graph node ${node.id} blocked by lifecycle hook`))
            }
            const taskResult = yield* taskDefinition.execute(
              {
                description: `${description}: ${node.role}`,
                prompt: node.prompt,
                subagent_type: agentForRole(node.role),
                background: false,
              },
              ctx,
            )
            return taskResult.output
          }),
        )

        if (hooks) {
          yield* hooks
            .run({
              event: "graph.complete",
              timestamp: Date.now(),
              sessionID: String(ctx.sessionID),
              graphID: id,
              data: { state: result.state, mode: result.mode, summary: result.nodes.size },
            })
            .pipe(Effect.ignore)
        }

        const output = [...result.nodes.values()]
          .map((node) =>
            [`## ${node.role} (${node.id})`, `State: ${node.state}`, node.result ?? node.error ?? ""].join("\n"),
          )
          .join("\n\n")
        return {
          title: description,
          metadata: {
            graphID: id,
            mode: result.mode,
            state: result.state,
            revision: result.revision,
          },
          output: `<collaboration id="${id}" mode="${result.mode}" state="${result.state}">\n${output}\n</collaboration>`,
        }
      }),
    }
  }),
)

export * as CollaborationTool from "./tool"
