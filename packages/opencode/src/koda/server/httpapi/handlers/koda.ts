import { Effect, Option } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import * as kodaAgent from "@/koda/agent"
import { CommandFiles } from "@/koda/command-files"
import * as kodaSkill from "@/koda/skill-remove"
import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { Config } from "@/config/config"
import { WorkspaceRef } from "@/effect/instance-ref"
import { InstanceState } from "@/effect/instance-state"
import { HeapSnapshot } from "@/koda/cli/heap-snapshot"
import type { RequestID as AgentManagerRequestID } from "@/koda/agent-manager/protocol"
import { AgentManager } from "@/koda/agent-manager/service"
import type { RequestID as NotebookRequestID } from "@/koda/notebook/protocol"
import { Notebook } from "@/koda/notebook/service"
import { ModelUsage } from "@/koda/session/model-usage"
import { ProviderUsage } from "@opencode-ai/core/koda/provider-usage"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { InstanceStore } from "@/project/instance-store"
import { InstanceHttpApi } from "@/server/routes/instance/httpapi/api"
import { InvalidRequestError } from "@/server/routes/instance/httpapi/errors"
import { Skill } from "@/skill"
import { BackgroundJob } from "@/background/job"
import { CollaborationCoordinator } from "@/koda/orchestration/service"
import { Service as LifecycleHooks } from "@/koda/hooks/service"
import { graphSummary } from "@/koda/orchestration/graph"
import { SessionRunState } from "@/session/run-state"
import { SessionID } from "@/session/schema"
import {
  AgentManagerRejectPayload,
  AgentManagerReplyPayload,
  NotebookRejectPayload,
  NotebookReplyPayload,
  RemoveAgentPayload,
  RemoveCommandPayload,
  RemoveSkillPayload,
  BackgroundJobInfo,
  BackgroundJobsQuery,
  CollaborationSummary,
} from "../groups/koda"

export const kodaHandlers = HttpApiBuilder.group(InstanceHttpApi, "koda-workspace", (handlers) =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const commands = yield* Command.Service
    const skills = yield* Skill.Service
    const config = yield* Config.Service
    const store = yield* InstanceStore.Service
    const manager = yield* AgentManager.Service
    const notebook = yield* Notebook.Service
    const background = yield* BackgroundJob.Service
    const runState = yield* SessionRunState.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* CollaborationCoordinator.Service
    const hooks = yield* LifecycleHooks

    // Location-scoped services, keyed by the request's directory and workspace.
    const located = Effect.fnUntraced(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
      return yield* effect.pipe(
        Effect.provide(
          locations.get(
            Location.Ref.make({
              directory: AbsolutePath.make((yield* InstanceState.context).directory),
              workspaceID: yield* WorkspaceRef,
            }),
          ),
        ),
      )
    })

    const heapSnapshot = Effect.fn("kodaHttpApi.heapSnapshot")(function* () {
      return yield* Effect.sync(() => HeapSnapshot.write())
    })

    const commandFiles = Effect.fn("kodaHttpApi.commandFiles")(function* () {
      const instance = yield* InstanceState.context
      const dirs = yield* config.directories()
      const items = yield* commands.list()
      return yield* Effect.tryPromise({
        try: () => CommandFiles.discover({ commands: items, directories: dirs, directory: instance.directory }),
        catch: (err) => err,
      }).pipe(Effect.catch((err) => Effect.die(err)))
    })

    const removeCommand = Effect.fn("kodaHttpApi.removeCommand")(function* (ctx: {
      payload: typeof RemoveCommandPayload.Type
    }) {
      const instance = yield* InstanceState.context
      const dirs = yield* config.directories()
      const items = yield* commands.list()
      const entries = yield* Effect.tryPromise({
        try: () => CommandFiles.discover({ commands: items, directories: dirs, directory: instance.directory }),
        catch: (err) => err,
      }).pipe(Effect.catch((err) => Effect.die(err)))
      yield* Effect.tryPromise({
        try: () => CommandFiles.remove(ctx.payload.location, entries),
        catch: () => new HttpApiError.BadRequest({}),
      })
      yield* store.dispose(instance)
      return true
    })

    const removeSkill = Effect.fn("kodaHttpApi.removeSkill")(function* (ctx: {
      payload: typeof RemoveSkillPayload.Type
    }) {
      const instance = yield* InstanceState.context
      const entries = yield* skills.all()
      yield* Effect.tryPromise({
        try: () => kodaSkill.remove(ctx.payload.location, entries),
        catch: () => new HttpApiError.BadRequest({}),
      })
      yield* store.dispose(instance)
      return true
    })

    const removeAgent = Effect.fn("kodaHttpApi.removeAgent")(function* (ctx: {
      payload: typeof RemoveAgentPayload.Type
    }) {
      const instance = yield* InstanceState.context
      const agent = yield* agents.get(ctx.payload.name)
      const dirs = yield* config.directories()
      yield* Effect.tryPromise({
        try: () =>
          kodaAgent.remove({
            name: ctx.payload.name,
            agent,
            dirs,
            directory: instance.directory,
            worktree: instance.worktree,
            scope: ctx.payload.scope,
          }),
        catch: (err) => err,
      }).pipe(
        Effect.catch((err) => {
          if (kodaAgent.RemoveError.isInstance(err))
            return Effect.fail(new InvalidRequestError({ message: err.data.message }))
          return Effect.die(err)
        }),
      )
      yield* store.dispose(instance)
      return true
    })

    const providerUsage = Effect.fn("kodaHttpApi.providerUsage")(function* () {
      return yield* located(ProviderUsage.Service.use((usage) => usage.get())).pipe(
        Effect.mapError(() => new HttpApiError.ServiceUnavailable({})),
      )
    })

    const providerUsageRefresh = Effect.fn("kodaHttpApi.providerUsageRefresh")(function* () {
      return yield* located(ProviderUsage.Service.use((usage) => usage.refresh())).pipe(
        Effect.mapError(() => new HttpApiError.ServiceUnavailable({})),
      )
    })

    const notebookList = Effect.fn("kodaHttpApi.notebookList")(function* () {
      return yield* notebook.list()
    })

    const notebookReply = Effect.fn("kodaHttpApi.notebookReply")(function* (ctx: {
      params: { requestID: NotebookRequestID }
      payload: typeof NotebookReplyPayload.Type
    }) {
      yield* notebook.reply({ requestID: ctx.params.requestID, result: ctx.payload.result }).pipe(
        Effect.catchTag("Notebook.NotFoundError", () => Effect.fail(new HttpApiError.NotFound({}))),
        Effect.catchTag("Notebook.InvalidReplyError", () => Effect.fail(new HttpApiError.BadRequest({}))),
      )
      return true
    })

    const notebookReject = Effect.fn("kodaHttpApi.notebookReject")(function* (ctx: {
      params: { requestID: NotebookRequestID }
      payload: typeof NotebookRejectPayload.Type
    }) {
      yield* notebook
        .reject({ requestID: ctx.params.requestID, error: ctx.payload.error })
        .pipe(Effect.catchTag("Notebook.NotFoundError", () => Effect.fail(new HttpApiError.NotFound({}))))
      return true
    })

    const agentManagerList = Effect.fn("kodaHttpApi.agentManagerList")(function* () {
      return yield* manager.list()
    })

    const agentManagerReply = Effect.fn("kodaHttpApi.agentManagerReply")(function* (ctx: {
      params: { requestID: AgentManagerRequestID }
      payload: typeof AgentManagerReplyPayload.Type
    }) {
      yield* manager.reply({ requestID: ctx.params.requestID, result: ctx.payload.result }).pipe(
        Effect.catchTag("AgentManager.NotFoundError", () => Effect.fail(new HttpApiError.NotFound({}))),
        Effect.catchTag("AgentManager.InvalidReplyError", () => Effect.fail(new HttpApiError.BadRequest({}))),
      )
      return true
    })

    const agentManagerReject = Effect.fn("kodaHttpApi.agentManagerReject")(function* (ctx: {
      params: { requestID: AgentManagerRequestID }
      payload: typeof AgentManagerRejectPayload.Type
    }) {
      yield* manager
        .reject({ requestID: ctx.params.requestID, error: ctx.payload.error })
        .pipe(Effect.catchTag("AgentManager.NotFoundError", () => Effect.fail(new HttpApiError.NotFound({}))))
      return true
    })

    const sessionModelUsage = Effect.fn("kodaHttpApi.sessionModelUsage")(function* (ctx: {
      params: { sessionID: SessionID }
    }) {
      const usage = yield* ModelUsage.get(ctx.params.sessionID)
      if (!usage) return yield* new HttpApiError.NotFound({})
      return usage
    })

    const backgroundJobs = Effect.fn("kodaHttpApi.backgroundJobs")(function* (ctx: {
      query: typeof BackgroundJobsQuery.Type
    }) {
      return (yield* background.list())
        .filter((job) => job.metadata?.parentSessionId === ctx.query.sessionID)
        .map((job) => ({
          id: job.id,
          type: job.type,
          title: job.title,
          status: job.status,
          started_at: job.started_at,
          completed_at: job.completed_at,
          error: job.error,
          metadata: job.metadata,
        })) satisfies (typeof BackgroundJobInfo.Type)[]
    })

    const backgroundJobCancel = Effect.fn("kodaHttpApi.backgroundJobCancel")(function* (ctx: {
      params: { jobID: string }
    }) {
      const job = yield* background.get(ctx.params.jobID)
      if (!job) return yield* new HttpApiError.NotFound({})
      const sessionID = SessionID.make(typeof job.metadata?.sessionId === "string" ? job.metadata.sessionId : job.id)
      yield* runState.cancel(sessionID)
      return true
    })

    const collaborationGraphs = Effect.fn("kodaHttpApi.collaborationGraphs")(function* () {
      return (yield* coordinator.list()).map(graphSummary) satisfies (typeof CollaborationSummary.Type)[]
    })

    const collaborationSummary = Effect.fn("kodaHttpApi.collaborationSummary")(function* (ctx: {
      params: { graphID: string }
    }) {
      const summary = yield* coordinator.summary(ctx.params.graphID)
      if (Option.isNone(summary)) return yield* new HttpApiError.NotFound({})
      return summary.value satisfies typeof CollaborationSummary.Type
    })

    const collaborationCancel = Effect.fn("kodaHttpApi.collaborationCancel")(function* (ctx: {
      params: { graphID: string }
    }) {
      const cancelled = yield* coordinator.cancel(ctx.params.graphID)
      if (Option.isNone(cancelled)) return yield* new HttpApiError.NotFound({})
      for (const node of cancelled.value.nodes.values()) {
        if (!node.sessionID) continue
        yield* runState.cancel(SessionID.make(node.sessionID)).pipe(Effect.ignore)
      }
      return true
    })

    const collaborationRecover = Effect.fn("kodaHttpApi.collaborationRecover")(function* () {
      return (yield* coordinator.recover()).map(graphSummary) satisfies (typeof CollaborationSummary.Type)[]
    })

    const hookList = Effect.fn("kodaHttpApi.hooks")(function* () {
      return yield* hooks.list()
    })

    return handlers
      .handle("heapSnapshot", heapSnapshot)
      .handle("commandFiles", commandFiles)
      .handle("removeCommand", removeCommand)
      .handle("removeSkill", removeSkill)
      .handle("removeAgent", removeAgent)
      .handle("providerUsage", providerUsage)
      .handle("providerUsageRefresh", providerUsageRefresh)
      .handle("notebookList", notebookList)
      .handle("notebookReply", notebookReply)
      .handle("notebookReject", notebookReject)
      .handle("agentManagerList", agentManagerList)
      .handle("agentManagerReply", agentManagerReply)
      .handle("agentManagerReject", agentManagerReject)
      .handle("sessionModelUsage", sessionModelUsage)
      .handle("backgroundJobs", backgroundJobs)
      .handle("backgroundJobCancel", backgroundJobCancel)
      .handle("collaborationGraphs", collaborationGraphs)
      .handle("collaborationSummary", collaborationSummary)
      .handle("collaborationCancel", collaborationCancel)
      .handle("collaborationRecover", collaborationRecover)
      .handle("hooks", hookList)
  }),
)
