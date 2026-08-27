import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { allowsNestedAgent } from "@/koda/agent/external-agent-compat"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider" // koda_change
import { kodaTask } from "../koda/tool/task" // koda_change
import { kodaTaskBackgroundProcess } from "../koda/tool/task-background-process" // koda_change
import { kodaCostPropagation } from "../koda/session/cost-propagation" // koda_change
import { kodaSessionProcessor } from "../koda/session/processor" // koda_change
import { kodaSession } from "../koda/session" // koda_change
import { resumeHint } from "../koda/task-resume" // koda_change
import { errorMessage } from "@/util/error" // koda_change
import { Cause, Effect, Exit, Option, Schema, Scope } from "effect"
import * as DateTime from "effect/DateTime"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import * as SandboxPolicy from "@/koda/sandbox/policy" // koda_change
import { Database } from "@opencode-ai/core/database/database"
import { Service as LifecycleHooks } from "@/koda/hooks/service"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionEvent } from "@opencode-ai/core/session/event"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<SessionV1.WithParts>
}

const id = "task"
const TASK_RECORD_TEXT_MAX = 4_000

function boundedTaskText(value: string) {
  return value.length <= TASK_RECORD_TEXT_MAX ? value : `${value.slice(0, TASK_RECORD_TEXT_MAX)}…`
}
const BACKGROUND_DESCRIPTION = [
  "Background mode: background=true launches the subagent asynchronously and returns immediately.",
  "Use foreground when you need the result before proceeding; otherwise use background for non-overlapping work, but do not give the final answer until all required background results have arrived.", // koda_change
  "You will be notified automatically when it finishes.",
].join(" ")
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
].join("\n")
const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response.",
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the agent in the background. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress",
  }),
})

function renderOutput(input: {
  sessionID: SessionID
  state: "running" | "completed" | "error"
  summary?: string
  text: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  // koda_change start - surface the resumable task_id when a background subagent fails (#11620)
  const hint = resumeHint(input.sessionID)
  const body = input.state === "error" && !input.text.includes(hint) ? `${input.text}\n${hint}` : input.text
  // koda_change end
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
    ...(input.summary ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}>`,
    body, // koda_change - was input.text
    `</${tag}>`,
    "</task>",
  ].join("\n")
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const events = Option.getOrUndefined(yield* Effect.serviceOption(EventV2Bridge.Service))
    const provider = yield* Provider.Service // koda_change
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const lifecycleHooks = Option.getOrUndefined(yield* Effect.serviceOption(LifecycleHooks))

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      const runInBackground = params.background === true
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(new Error("Background subagents require koda_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"))
      }

      const parent = yield* sessions.get(ctx.sessionID)
      let current = parent
      let depth = 0
      while (current.parentID) {
        // koda_change start - tolerate pruned or corrupt ancestor rows
        const next = yield* sessions
          .get(current.parentID)
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(undefined)))
        if (!next) break
        // koda_change end
        depth++
        current = next // koda_change
      }
      if (depth >= (cfg.subagent_depth ?? 1)) {
        return yield* Effect.fail(
          new Error(
            `Subagent depth limit reached (${cfg.subagent_depth ?? 1}). Increase "subagent_depth" to allow nested subagents.`,
          ),
        )
      }

      const caller = yield* agent.get(ctx.agent)
      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }
      if (!allowsNestedAgent(caller, next.name)) {
        return yield* Effect.fail(new Error(`Agent ${caller.name} is not allowed to delegate to ${next.name}`))
      }

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      // koda_change start — reject primary agents; only subagent/all modes allowed
      kodaTask.validate(next, params.subagent_type)
      // koda_change end

      const canTask = depth + 1 < (cfg.subagent_depth ?? 1) // koda_change - honor upstream's opt-in depth limit
      const canTodo = next.permission.some((rule) => rule.permission === "todowrite")

      const session = params.task_id
        ? yield* sessions.get(SessionID.make(params.task_id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      if (session && session.parentID !== ctx.sessionID) {
        return yield* Effect.fail(
          new Error(`Cannot resume session ${params.task_id}: not a child of the current session`),
        ) // koda_change - prevent cross-session task resume
      }
      // koda_change start — inherit edit/bash/MCP restrictions from calling agent
      const rules = kodaTask.inherited({ caller, session: parent, mcp: cfg.mcp })
      const childPermission = kodaTask.merge(
        deriveSubagentSessionPermission({
          parentSessionPermission: parent.permission ?? [],
          subagent: next,
        }),
        cfg.experimental?.primary_tools?.map((permission) => ({
          permission,
          pattern: "*",
          action: "deny" as const,
        })) ?? [],
        kodaTask.permissions(rules, canTask),
      )
      // koda_change end
      // koda_change start - refresh current parent restrictions when resuming an existing task session
      const fallback = SandboxPolicy.fallback(cfg)
      if (session) {
        yield* SandboxPolicy.inherit(ctx.sessionID, session.id, fallback)
        const permission = kodaTask.merge(session.permission ?? [], childPermission)
        session.permission = permission
        yield* sessions.setPermission({ sessionID: session.id, permission })
      }
      // koda_change end
      const platform = kodaSession.resolvePlatform(ctx.sessionID) // koda_change - preserve parent attribution across task creation/resume
      // koda_change start - create a child session with inherited koda restrictions
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
          agent: next.name,
          platform, // koda_change
          permission: childPermission, // koda_change - persist inherited koda ceilings and upstream child denies
        }))
      // koda_change end
      // koda_change start - rebuild in-memory ancestry and inherit confinement after creation/resume
      kodaSession.register({ id: nextSession.id, parentID: ctx.sessionID, platform })
      yield* SandboxPolicy.inherit(ctx.sessionID, nextSession.id, fallback).pipe(
        Effect.provideService(Config.Service, config),
      )
      // koda_change end

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      // koda_change start — prefer valid subagent overrides, safely inheriting when overrides go stale
      const selected = yield* kodaTask.resolveModel({
        name: next.name,
        agent: next,
        config: cfg,
        parent: {
          modelID: msg.info.modelID,
          providerID: msg.info.providerID,
        },
        variant: msg.info.variant,
        workflow: kodaTask.workflow(ctx.extra), // koda_change
        provider,
      })
      const model = selected.model
      const variant = selected.variant
      // koda_change end
      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        variant, // koda_change
        ...(runInBackground ? { background: true } : {}),
      }
      const delegation = {
        sessionID: ctx.sessionID,
        childSessionID: nextSession.id,
        agent: next.name,
        description: boundedTaskText(params.description),
        background: runInBackground,
        ...(session ? { resumed: true } : {}),
      }
      const startedAt = Date.now()
      if (events) {
        yield* events.publish(SessionEvent.Delegation.Started, {
          ...delegation,
          timestamp: DateTime.makeUnsafe(startedAt),
        })
      }

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const runTask = Effect.fn("TaskTool.runTask")(
        function* () {
          if (lifecycleHooks) {
            const gate = yield* lifecycleHooks.run({
              event: "subagent.start",
              timestamp: Date.now(),
              sessionID: String(nextSession.id),
              parentSessionID: String(ctx.sessionID),
              tool: "task",
              data: { agent: next.name, description: params.description, background: runInBackground },
            })
            if (!gate.allowed) return yield* Effect.fail(new Error(`Subagent ${next.name} blocked by lifecycle hook`))
          }
          const parts = yield* ops.resolvePromptParts(params.prompt)
          kodaSessionProcessor.markReviewTelemetry(parts, params.command) // koda_change - carry review command into child session telemetry
          const result = yield* ops.prompt({
            messageID: MessageID.ascending(),
            sessionID: nextSession.id,
            model: {
              modelID: model.modelID,
              providerID: model.providerID,
            },
            variant, // koda_change
            agent: next.name,
            tools: {
              question: false, // koda_change - subagents cannot prompt the user directly
              interactive_terminal: false, // koda_change - subagents cannot take over the user's terminal
              ...(canTodo ? {} : { todowrite: false }),
              ...(canTask ? {} : { task: false }),
              ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
            },
            parts,
          })
          // koda_change start - expose terminal child assistant errors through the task tool boundary,
          // including the resumable task_id so the parent agent can continue the subagent (#11620)
          if (result.info.role === "assistant" && result.info.error) {
            if (lifecycleHooks) {
              yield* lifecycleHooks
                .run({
                  event: "subagent.error",
                  timestamp: Date.now(),
                  sessionID: String(nextSession.id),
                  parentSessionID: String(ctx.sessionID),
                  tool: "task",
                  data: { agent: next.name, description: params.description, error: errorMessage(result.info.error) },
                })
                .pipe(Effect.ignore)
            }
            return yield* Effect.fail(new Error(`${errorMessage(result.info.error)}\n${resumeHint(nextSession.id)}`))
          }
          const output = result.parts.findLast((item) => item.type === "text")?.text ?? ""
          if (lifecycleHooks) {
            yield* lifecycleHooks
              .run({
                event: "subagent.complete",
                timestamp: Date.now(),
                sessionID: String(nextSession.id),
                parentSessionID: String(ctx.sessionID),
                tool: "task",
                data: { agent: next.name, description: params.description, output },
              })
              .pipe(Effect.ignore)
          }
          // koda_change end
          return output
        },
        Effect.ensuring(kodaTaskBackgroundProcess.finish(nextSession.id)),
      ) // koda_change - transfer inherited processes when the child run ends

      const trackedRunTask = () =>
        runTask().pipe(
          Effect.tap((output) =>
            events
              ? events.publish(SessionEvent.Delegation.Finished, {
                  ...delegation,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                  status: "completed",
                  durationMs: Math.max(0, Date.now() - startedAt),
                  summary: boundedTaskText(output),
                })
              : Effect.void,
          ),
          Effect.catchCause((cause) => {
            const error = boundedTaskText(errorMessage(Cause.squash(cause)))
            const status = Cause.hasInterruptsOnly(cause)
              ? "cancelled"
              : error.includes("blocked by lifecycle hook")
                ? "blocked"
                : "failed"
            const published = events
              ? events.publish(SessionEvent.Delegation.Finished, {
                  ...delegation,
                  timestamp: DateTime.makeUnsafe(Date.now()),
                  status,
                  durationMs: Math.max(0, Date.now() - startedAt),
                  error,
                })
              : Effect.void
            return published.pipe(Effect.flatMap(() => Effect.failCause(cause)))
          }),
        )

      // koda_change start - inject completed background task results into the parent session
      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                text: renderOutput({
                  sessionID: nextSession.id,
                  state,
                  summary:
                    state === "completed"
                      ? `Background task completed: ${params.description}`
                      : `Background task failed: ${params.description}`,
                  text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })
      // koda_change end

      // koda_change start - background tasks propagate only cost accrued by this invocation
      const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* (jobID: string) {
        yield* background.wait({ id: jobID }).pipe(
          Effect.flatMap((result) => {
            if (result.info?.status === "completed") return inject("completed", result.info.output ?? "")
            if (result.info?.status === "error") return inject("error", result.info.error ?? "")
            return Effect.void
          }),
          Effect.forkIn(scope, { startImmediately: true }),
        )
      })

      const withCostPropagation = <A, E, R>(task: Effect.Effect<A, E, R>) =>
        Effect.acquireUseRelease(
          kodaCostPropagation.childCost(sessions, nextSession.id),
          () => task,
          (costBefore) =>
            Effect.gen(function* () {
              const costAfter = yield* kodaCostPropagation.childCost(sessions, nextSession.id)
              yield* kodaCostPropagation
                .propagate(sessions, ctx.sessionID, ctx.messageID, costAfter - costBefore)
                .pipe(Effect.provideService(Database.Service, database))
            }),
        )

      const backgroundRun = withCostPropagation(
        trackedRunTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id))),
      )
      // koda_change end

      if (
        yield* background.extend({
          id: nextSession.id,
          // koda_change - extended background work also propagates its cost
          run: withCostPropagation(trackedRunTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id)))),
        })
      ) {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: nextSession.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task updated",
            text: BACKGROUND_UPDATED,
          }),
        }
      }

      const foregroundCost = runInBackground
        ? undefined
        : yield* kodaCostPropagation.childCost(sessions, nextSession.id) // koda_change - snapshot before the foreground job starts
      const info = yield* background.start({
        id: nextSession.id,
        type: id,
        title: params.description,
        metadata,
        onPromote: Effect.all([
          ctx.metadata({
            title: params.description,
            metadata: { ...metadata, background: true, jobId: nextSession.id },
          }),
          notify(nextSession.id),
        ]),
        // koda_change - only the initial-background start needs its own cost bracket; the
        // foreground/promoted path below is already wrapped by the acquireUseRelease at the bottom of run()
        run: runInBackground
          ? backgroundRun
          : trackedRunTask().pipe(Effect.onInterrupt(() => ops.cancel(nextSession.id))),
      })

      function backgroundResult() {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: info.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task started",
            text: BACKGROUND_STARTED,
          }),
        }
      }

      if (runInBackground) {
        yield* notify(info.id)
        return backgroundResult()
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        // koda_change start - snapshot child cost so we propagate only the delta on resume (#6321)
        Effect.gen(function* () {
          ctx.abort.addEventListener("abort", onAbort)
          return foregroundCost ?? (yield* kodaCostPropagation.childCost(sessions, nextSession.id))
        }),
        // koda_change end
        () =>
          Effect.gen(function* () {
            const result = yield* Effect.raceFirst(
              background.wait({ id: nextSession.id }).pipe(Effect.map((waited) => waited.info)),
              background.waitForPromotion(nextSession.id),
            )
            if (result?.metadata?.background === true) return backgroundResult()
            if (result?.status === "error") return yield* Effect.fail(new Error(result.error ?? "Task failed"))
            if (result?.status === "cancelled") return yield* Effect.fail(new Error("Task cancelled"))
            return {
              title: params.description,
              metadata,
              output: renderOutput({ sessionID: nextSession.id, state: "completed", text: result?.output ?? "" }),
            }
          }),
        // koda_change start - propagate subagent cost delta to parent on every exit path (#6321)
        (costBefore, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit))
              yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })
          }).pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                ctx.abort.removeEventListener("abort", onAbort)
                const costAfter = yield* kodaCostPropagation
                  .childCost(sessions, nextSession.id)
                  .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(costBefore)))
                yield* kodaCostPropagation
                  .propagate(sessions, ctx.sessionID, ctx.messageID, costAfter - costBefore)
                  .pipe(
                    Effect.provideService(Database.Service, database),
                    Effect.catchTag("NotFoundError", () => Effect.void),
                  )
              }),
            ),
          ),
        // koda_change end
      )
    })

    return {
      description: flags.experimentalBackgroundSubagents
        ? [DESCRIPTION, BACKGROUND_DESCRIPTION].join("\n\n")
        : DESCRIPTION,
      parameters: Parameters,
      jsonSchema: flags.experimentalBackgroundSubagents ? undefined : ToolJsonSchema.fromSchema(BaseParameters),
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
