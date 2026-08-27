import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "@/server/routes/instance/httpapi/middleware/workspace-routing"
import { described } from "@/server/routes/instance/httpapi/groups/metadata"
import { ProviderUsage } from "@opencode-ai/schema/koda/provider-usage"
import { AnacondaDesktopApi } from "./anaconda-desktop"
import {
  Failure as AgentManagerFailure,
  Request as AgentManagerRequest,
  RequestID as AgentManagerRequestID,
  Result as AgentManagerResult,
} from "@/koda/agent-manager/protocol"
import {
  Failure as NotebookFailure,
  Request as NotebookRequest,
  RequestID as NotebookRequestID,
  Result as NotebookResult,
} from "@/koda/notebook/protocol"
import { ModelUsage } from "@/koda/session/model-usage"
import { SessionID } from "@/session/schema"
import { CommandFiles } from "@/koda/command-files"
import { GraphNodeState, GraphState } from "@/koda/orchestration/graph"

const root = "/koda"
const Scope = Schema.Literals(["global", "project"])

export const BackgroundJobInfo = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  title: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "completed", "error", "cancelled"]),
  started_at: Schema.Number,
  completed_at: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

export const BackgroundJobsQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  sessionID: SessionID,
})

export const CollaborationNodeInfo = Schema.Struct({
  id: Schema.String,
  role: Schema.String,
  state: GraphNodeState,
  attempts: Schema.Number,
  sessionID: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
})

export const CollaborationSummary = Schema.Struct({
  id: Schema.String,
  mode: Schema.String,
  state: GraphState,
  maxConcurrency: Schema.Number,
  revision: Schema.Number,
  total: Schema.Number,
  counts: Schema.Record(GraphNodeState, Schema.Number),
  nodes: Schema.Array(CollaborationNodeInfo),
})

export const HookInfo = Schema.Struct({
  id: Schema.String,
  event: Schema.Unknown,
  matcher: Schema.optional(Schema.String),
  mode: Schema.String,
  onError: Schema.String,
  trusted: Schema.Boolean,
  enabled: Schema.Boolean,
})

export const RemoveSkillPayload = Schema.Struct({
  location: Schema.String,
})

export const RemoveCommandPayload = Schema.Struct({
  location: Schema.String,
})

export const RemoveAgentPayload = Schema.Struct({
  name: Schema.String,
  scope: Schema.optional(Scope),
})

export const NotebookReplyPayload = Schema.Struct({ result: NotebookResult })
export const NotebookRejectPayload = Schema.Struct({ error: NotebookFailure })
export const AgentManagerReplyPayload = Schema.Struct({ result: AgentManagerResult })
export const AgentManagerRejectPayload = Schema.Struct({ error: AgentManagerFailure })

export const kodaPaths = {
  heapSnapshot: `${root}/heap/snapshot`,
  commandFiles: `${root}/command/files`,
  removeCommand: `${root}/command/remove`,
  removeSkill: `${root}/skill/remove`,
  removeAgent: `${root}/agent/remove`,
  providerUsage: `${root}/provider-usage`,
  providerUsageRefresh: `${root}/provider-usage/refresh`,
  notebookList: `${root}/notebook`,
  notebookReply: `${root}/notebook/:requestID/reply`,
  notebookReject: `${root}/notebook/:requestID/reject`,
  agentManagerList: `${root}/agent-manager`,
  agentManagerReply: `${root}/agent-manager/:requestID/reply`,
  agentManagerReject: `${root}/agent-manager/:requestID/reject`,
  sessionModelUsage: `/session/:sessionID/model-usage`,
  backgroundJobs: `${root}/background-jobs`,
  backgroundJobCancel: `${root}/background-jobs/:jobID/cancel`,
  collaborationGraphs: `${root}/collaboration`,
  collaborationSummary: `${root}/collaboration/:graphID`,
  collaborationCancel: `${root}/collaboration/:graphID/cancel`,
  collaborationRecover: `${root}/collaboration/recover`,
  hooks: `${root}/hooks`,
} as const

export const kodaApi = HttpApi.make("koda-workspace")
  .add(
    HttpApiGroup.make("koda-workspace")
      .add(
        HttpApiEndpoint.post("heapSnapshot", kodaPaths.heapSnapshot, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.String, "Heap snapshot file path"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.heap.snapshot",
            summary: "Write heap snapshot",
            description: "Write a heap snapshot for the CLI process to the log directory.",
          }),
        ),
        HttpApiEndpoint.get("commandFiles", kodaPaths.commandFiles, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(CommandFiles.Info), "Command files"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.commandFiles",
            summary: "List command files",
            description: "List commands with editable file locations for settings clients.",
          }),
        ),
        HttpApiEndpoint.post("removeCommand", kodaPaths.removeCommand, {
          query: WorkspaceRoutingQuery,
          payload: RemoveCommandPayload,
          success: described(Schema.Boolean, "Command removed"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.removeCommand",
            summary: "Remove a command",
            description: "Remove a command by deleting its markdown file from disk and clearing it from cache.",
          }),
        ),
        HttpApiEndpoint.post("removeSkill", kodaPaths.removeSkill, {
          query: WorkspaceRoutingQuery,
          payload: RemoveSkillPayload,
          success: described(Schema.Boolean, "Skill removed"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.removeSkill",
            summary: "Remove a skill",
            description: "Remove a skill by deleting its manifest from disk and clearing it from cache.",
          }),
        ),
        HttpApiEndpoint.post("removeAgent", kodaPaths.removeAgent, {
          query: WorkspaceRoutingQuery,
          payload: RemoveAgentPayload,
          success: described(Schema.Boolean, "Agent removed"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.removeAgent",
            summary: "Remove a custom agent",
            description:
              "Remove a custom (non-native) agent from one writable configuration scope, or every writable scope when omitted, and dispose cached instance state.",
          }),
        ),
        HttpApiEndpoint.get("providerUsage", kodaPaths.providerUsage, {
          query: WorkspaceRoutingQuery,
          success: described(ProviderUsage.Info, "Current provider usage"),
          error: HttpApiError.ServiceUnavailable,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.providerUsage.get",
            summary: "Get provider usage",
            description: "Get cache-aware, secret-free provider plan usage and personal billing status.",
          }),
        ),
        HttpApiEndpoint.post("providerUsageRefresh", kodaPaths.providerUsageRefresh, {
          query: WorkspaceRoutingQuery,
          success: described(ProviderUsage.Info, "Refreshed provider usage"),
          error: HttpApiError.ServiceUnavailable,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.providerUsage.refresh",
            summary: "Refresh provider usage",
            description: "Refresh provider plan usage while coalescing concurrent source requests.",
          }),
        ),
        HttpApiEndpoint.get("notebookList", kodaPaths.notebookList, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(NotebookRequest), "Pending notebook host requests"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.notebook.list",
            summary: "List pending notebook requests",
            description: "List pending native notebook requests for the routed workspace.",
          }),
        ),
        HttpApiEndpoint.post("notebookReply", kodaPaths.notebookReply, {
          params: { requestID: NotebookRequestID },
          query: WorkspaceRoutingQuery,
          payload: NotebookReplyPayload,
          success: described(Schema.Boolean, "Notebook reply accepted"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.notebook.reply",
            summary: "Reply to a notebook request",
            description: "Complete a pending native notebook request with a structured result.",
          }),
        ),
        HttpApiEndpoint.post("notebookReject", kodaPaths.notebookReject, {
          params: { requestID: NotebookRequestID },
          query: WorkspaceRoutingQuery,
          payload: NotebookRejectPayload,
          success: described(Schema.Boolean, "Notebook rejection accepted"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.notebook.reject",
            summary: "Reject a notebook request",
            description: "Complete a pending native notebook request with a structured host error.",
          }),
        ),
        HttpApiEndpoint.get("agentManagerList", kodaPaths.agentManagerList, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(AgentManagerRequest), "Pending Agent Manager host requests"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.agentManager.list",
            summary: "List pending Agent Manager requests",
            description: "List pending native Agent Manager orchestration requests for the routed workspace.",
          }),
        ),
        HttpApiEndpoint.post("agentManagerReply", kodaPaths.agentManagerReply, {
          params: { requestID: AgentManagerRequestID },
          query: WorkspaceRoutingQuery,
          payload: AgentManagerReplyPayload,
          success: described(Schema.Boolean, "Agent Manager reply accepted"),
          error: [HttpApiError.BadRequest, HttpApiError.NotFound],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.agentManager.reply",
            summary: "Reply to an Agent Manager request",
            description: "Complete a pending Agent Manager orchestration request with a structured result.",
          }),
        ),
        HttpApiEndpoint.post("agentManagerReject", kodaPaths.agentManagerReject, {
          params: { requestID: AgentManagerRequestID },
          query: WorkspaceRoutingQuery,
          payload: AgentManagerRejectPayload,
          success: described(Schema.Boolean, "Agent Manager rejection accepted"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.agentManager.reject",
            summary: "Reject an Agent Manager request",
            description: "Complete a pending Agent Manager orchestration request with a structured host error.",
          }),
        ),
        HttpApiEndpoint.get("sessionModelUsage", kodaPaths.sessionModelUsage, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(ModelUsage.Info, "Model usage for a session tree"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.sessionModelUsage",
            summary: "Get session model usage",
            description: "Get token usage and direct cost by model for the complete top-level session tree.",
          }),
        ),
        HttpApiEndpoint.get("backgroundJobs", kodaPaths.backgroundJobs, {
          query: BackgroundJobsQuery,
          success: described(Schema.Array(BackgroundJobInfo), "Background jobs"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.backgroundJobs",
            summary: "List background jobs",
            description: "List background subagent jobs owned by one parent session.",
          }),
        ),
        HttpApiEndpoint.post("backgroundJobCancel", kodaPaths.backgroundJobCancel, {
          params: { jobID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Background job cancelled"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.backgroundJob.cancel",
            summary: "Cancel background job",
            description: "Cancel one background subagent job and its session tree.",
          }),
        ),
        HttpApiEndpoint.get("collaborationGraphs", kodaPaths.collaborationGraphs, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(CollaborationSummary), "Collaboration graph summaries"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.collaboration.list",
            summary: "List collaboration graphs",
            description: "List durable Koda collaboration graphs for the routed workspace.",
          }),
        ),
        HttpApiEndpoint.get("collaborationSummary", kodaPaths.collaborationSummary, {
          params: { graphID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(CollaborationSummary, "Collaboration graph summary"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.collaboration.summary",
            summary: "Get collaboration graph status",
            description: "Read the durable state and node status for one collaboration graph.",
          }),
        ),
        HttpApiEndpoint.post("collaborationCancel", kodaPaths.collaborationCancel, {
          params: { graphID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Collaboration graph cancelled"),
          error: HttpApiError.NotFound,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.collaboration.cancel",
            summary: "Cancel collaboration graph",
            description: "Cancel a running collaboration graph without deleting its durable evidence.",
          }),
        ),
        HttpApiEndpoint.post("collaborationRecover", kodaPaths.collaborationRecover, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(CollaborationSummary), "Recovered collaboration graphs"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.collaboration.recover",
            summary: "Recover collaboration graphs",
            description: "Recover interrupted durable collaboration graphs for the routed workspace.",
          }),
        ),
        HttpApiEndpoint.get("hooks", kodaPaths.hooks, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(HookInfo), "Configured lifecycle hooks"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "koda.hooks.list",
            summary: "List lifecycle hooks",
            description: "List sanitized lifecycle hook metadata without exposing commands or environment values.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "koda",
          description: "koda-specific routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .addHttpApi(AnacondaDesktopApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "koda HttpApi",
      version: "0.0.1",
      description: "koda HttpApi surface.",
    }),
  )
