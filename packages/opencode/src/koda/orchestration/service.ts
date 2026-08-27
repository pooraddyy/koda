import { Database } from "@opencode-ai/core/database/database"
import { CollaborationEventTable, CollaborationGraphTable, CollaborationNodeTable } from "@/koda/orchestration/sql"
import {
  CollaborationGraph,
  CollaborationNode,
  GraphNodeState,
  GraphState,
  cancelGraph,
  completeNode,
  createCollaborationGraph,
  failNode,
  finalizeGraph,
  graphSummary,
  heartbeatNode,
  readyNodes,
  refreshReadyNodes,
  recoverInterruptedNodes,
  recoverStaleNodes,
  startGraph,
  startNode,
} from "@/koda/orchestration/graph"
import { and, asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"

export class GraphStoreError extends Schema.TaggedErrorClass<GraphStoreError>()("Koda.GraphStoreError", {
  message: Schema.String,
}) {}

export type CollaborationRunner = (
  node: CollaborationNode,
  heartbeat: (progress?: string) => Effect.Effect<void, unknown>,
) => Effect.Effect<string, unknown>

export interface Interface {
  readonly create: (
    input: Parameters<typeof createCollaborationGraph>[0],
  ) => Effect.Effect<CollaborationGraph, GraphStoreError>
  readonly get: (id: string) => Effect.Effect<Option.Option<CollaborationGraph>, GraphStoreError>
  readonly list: (rootSessionID?: string) => Effect.Effect<ReadonlyArray<CollaborationGraph>, GraphStoreError>
  readonly execute: (id: string, runner: CollaborationRunner) => Effect.Effect<CollaborationGraph, GraphStoreError>
  readonly cancel: (id: string, reason?: string) => Effect.Effect<Option.Option<CollaborationGraph>, GraphStoreError>
  readonly recover: (rootSessionID?: string) => Effect.Effect<ReadonlyArray<CollaborationGraph>, GraphStoreError>
  readonly summary: (id: string) => Effect.Effect<Option.Option<ReturnType<typeof graphSummary>>, GraphStoreError>
  readonly heartbeat: (
    id: string,
    nodeID: string,
    progress?: string,
  ) => Effect.Effect<Option.Option<CollaborationGraph>, GraphStoreError>
  readonly recoverStale: (
    id: string,
    staleAfterMs?: number,
  ) => Effect.Effect<Option.Option<CollaborationGraph>, GraphStoreError>
}

export class Service extends Context.Service<Service, Interface>()("@koda/CollaborationCoordinator") {}

type DatabaseShape = typeof CollaborationGraphTable.$inferSelect

function decodeGraph(row: DatabaseShape, nodes: ReadonlyArray<typeof CollaborationNodeTable.$inferSelect>) {
  const graphState = Schema.decodeUnknownSync(GraphState)(row.state)
  const byID = new Map<string, CollaborationNode>()
  for (const node of nodes) {
    const state = Schema.decodeUnknownSync(GraphNodeState)(node.state)
    const dependsOn = Array.isArray(node.depends_on) ? node.depends_on : []
    byID.set(node.node_id, {
      id: node.node_id,
      role: node.role,
      prompt: node.prompt,
      dependsOn: [...dependsOn],
      mutation: node.mutation,
      maxAttempts: node.max_attempts,
      state,
      attempts: node.attempts,
      ...(node.session_id ? { sessionID: node.session_id } : {}),
      ...(node.result !== null ? { result: node.result } : {}),
      ...(node.error !== null ? { error: node.error } : {}),
      ...(node.started_at !== null ? { startedAt: node.started_at } : {}),
      ...(node.finished_at !== null ? { finishedAt: node.finished_at } : {}),
    })
  }
  return {
    id: row.id,
    rootSessionID: row.root_session_id,
    mode: row.mode,
    maxConcurrency: row.max_concurrency,
    state: graphState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    nodes: byID,
  } satisfies CollaborationGraph
}

function failureText(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const cache = new Map<string, CollaborationGraph>()
    const locks = new Map<string, ReturnType<typeof Semaphore.makeUnsafe>>()

    const lockFor = (id: string) => {
      const existing = locks.get(id)
      if (existing) return existing
      const created = Semaphore.makeUnsafe(1)
      locks.set(id, created)
      return created
    }

    const query = <A>(effect: Effect.Effect<A, unknown>) =>
      effect.pipe(Effect.mapError((cause) => new GraphStoreError({ message: failureText(cause) })))

    const load = Effect.fn("CollaborationCoordinator.load")(function* (id: string) {
      const row = yield* query(
        db.select().from(CollaborationGraphTable).where(eq(CollaborationGraphTable.id, id)).get(),
      )
      if (!row) return Option.none<CollaborationGraph>()
      const nodes = yield* query(
        db
          .select()
          .from(CollaborationNodeTable)
          .where(eq(CollaborationNodeTable.graph_id, id))
          .orderBy(asc(CollaborationNodeTable.node_id))
          .all(),
      )
      const graph = decodeGraph(row, nodes)
      const heartbeatRows = yield* query(
        db
          .select({ nodeID: CollaborationEventTable.node_id, payload: CollaborationEventTable.payload })
          .from(CollaborationEventTable)
          .where(and(eq(CollaborationEventTable.graph_id, id), eq(CollaborationEventTable.type, "node.heartbeat")))
          .orderBy(asc(CollaborationEventTable.sequence))
          .all(),
      )
      for (const row of heartbeatRows) {
        if (!row.nodeID) continue
        const node = graph.nodes.get(row.nodeID)
        if (node?.state !== "running") continue
        const heartbeat = row.payload as { lastHeartbeatAt?: unknown; progress?: unknown }
        if (typeof heartbeat.lastHeartbeatAt === "number") node.lastHeartbeatAt = heartbeat.lastHeartbeatAt
        if (typeof heartbeat.progress === "string") node.progress = heartbeat.progress
      }
      cache.set(id, graph)
      return Option.some(graph)
    })

    const requireGraph = Effect.fn("CollaborationCoordinator.requireGraph")(function* (id: string) {
      const cached = cache.get(id)
      if (cached) return cached
      const found = yield* load(id)
      if (Option.isNone(found))
        return yield* new GraphStoreError({ message: `Collaboration graph ${id} was not found` })
      return found.value
    })

    const persist = Effect.fn("CollaborationCoordinator.persist")(function* (
      graph: CollaborationGraph,
      event: {
        type: string
        nodeID?: string
        payload?: Record<string, unknown>
      },
    ) {
      const nodes = [...graph.nodes.values()]
      yield* query(
        db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .insert(CollaborationGraphTable)
              .values({
                id: graph.id,
                root_session_id: graph.rootSessionID,
                mode: graph.mode,
                state: graph.state,
                max_concurrency: graph.maxConcurrency,
                revision: graph.revision,
                created_at: graph.createdAt,
                updated_at: graph.updatedAt,
              })
              .onConflictDoUpdate({
                target: CollaborationGraphTable.id,
                set: {
                  state: graph.state,
                  revision: graph.revision,
                  updated_at: graph.updatedAt,
                },
              })
              .run()
            yield* tx.delete(CollaborationNodeTable).where(eq(CollaborationNodeTable.graph_id, graph.id)).run()
            if (nodes.length > 0) {
              yield* tx
                .insert(CollaborationNodeTable)
                .values(
                  nodes.map((node) => ({
                    graph_id: graph.id,
                    node_id: node.id,
                    role: node.role,
                    prompt: node.prompt,
                    depends_on: node.dependsOn,
                    mutation: node.mutation,
                    max_attempts: node.maxAttempts,
                    state: node.state,
                    attempts: node.attempts,
                    session_id: node.sessionID ?? null,
                    result: node.result ?? null,
                    error: node.error ?? null,
                    started_at: node.startedAt ?? null,
                    finished_at: node.finishedAt ?? null,
                  })),
                )
                .run()
            }
            yield* tx
              .insert(CollaborationEventTable)
              .values({
                id: `${graph.id}:${graph.revision}`,
                graph_id: graph.id,
                sequence: graph.revision,
                node_id: event.nodeID ?? null,
                type: event.type,
                payload: event.payload ?? {},
                created_at: graph.updatedAt,
              })
              .onConflictDoNothing()
              .run()
          }),
        ),
      )
      cache.set(graph.id, graph)
      return graph
    })

    const create: Interface["create"] = Effect.fn("CollaborationCoordinator.create")(function* (input) {
      const graph = createCollaborationGraph(input)
      const existing = yield* query(
        db
          .select({ id: CollaborationGraphTable.id })
          .from(CollaborationGraphTable)
          .where(eq(CollaborationGraphTable.id, graph.id))
          .get(),
      )
      if (existing) return yield* new GraphStoreError({ message: `Collaboration graph ${graph.id} already exists` })
      return yield* persist(graph, { type: "graph.created", payload: { mode: graph.mode, nodes: graph.nodes.size } })
    })

    const get: Interface["get"] = Effect.fn("CollaborationCoordinator.get")(function* (id) {
      const cached = cache.get(id)
      if (cached) return Option.some(cached)
      return yield* load(id)
    })

    const list: Interface["list"] = Effect.fn("CollaborationCoordinator.list")(function* (rootSessionID) {
      const rows = yield* query(
        rootSessionID
          ? db
              .select()
              .from(CollaborationGraphTable)
              .where(eq(CollaborationGraphTable.root_session_id, rootSessionID))
              .orderBy(asc(CollaborationGraphTable.updated_at))
              .all()
          : db.select().from(CollaborationGraphTable).orderBy(asc(CollaborationGraphTable.updated_at)).all(),
      )
      return yield* Effect.forEach(rows, (row) =>
        query(
          db
            .select()
            .from(CollaborationNodeTable)
            .where(eq(CollaborationNodeTable.graph_id, row.id))
            .orderBy(asc(CollaborationNodeTable.node_id))
            .all(),
        ).pipe(Effect.map((nodes) => decodeGraph(row, nodes))),
      )
    })

    const execute: Interface["execute"] = Effect.fn("CollaborationCoordinator.execute")(function* (id, runner) {
      const graph = yield* requireGraph(id)
      return yield* lockFor(id).withPermit(
        Effect.gen(function* () {
          if (graph.state === "planning") {
            startGraph(graph)
            yield* persist(graph, { type: "graph.started" })
          }
          while (graph.state === "running") {
            const candidates = readyNodes(graph)
            if (candidates.length === 0) {
              finalizeGraph(graph)
              yield* persist(graph, { type: "graph.finalized" })
              break
            }
            for (const node of candidates) {
              startNode(graph, node.id)
              yield* persist(graph, { type: "node.started", nodeID: node.id, payload: { role: node.role } })
            }
            const outcomes = yield* Effect.all(
              candidates.map((node) => {
                const heartbeat = (progress?: string) =>
                  Effect.gen(function* () {
                    const updated = heartbeatNode(graph, node.id, progress)
                    yield* persist(graph, {
                      type: "node.heartbeat",
                      nodeID: node.id,
                      payload: { lastHeartbeatAt: updated.lastHeartbeatAt, progress: updated.progress },
                    })
                  })
                return runner(node, heartbeat).pipe(
                  Effect.map((result) => ({ node, result, error: undefined as string | undefined })),
                  Effect.catch((error) => Effect.succeed({ node, result: "", error: failureText(error) })),
                )
              }),
              { concurrency: "unbounded" },
            )
            for (const outcome of outcomes) {
              if (graph.state !== "running") break
              if (outcome.error) {
                failNode(graph, outcome.node.id, outcome.error)
                yield* persist(graph, {
                  type: "node.failed",
                  nodeID: outcome.node.id,
                  payload: { error: outcome.error, attempts: outcome.node.attempts },
                })
              } else {
                completeNode(graph, outcome.node.id, outcome.result)
                yield* persist(graph, { type: "node.completed", nodeID: outcome.node.id })
              }
            }
            refreshReadyNodes(graph)
          }
          return graph
        }),
      )
    })

    const cancel: Interface["cancel"] = Effect.fn("CollaborationCoordinator.cancel")(function* (id, reason) {
      return yield* lockFor(id).withPermit(
        Effect.gen(function* () {
          const graph = cache.get(id) ?? Option.getOrUndefined(yield* load(id))
          if (!graph) return Option.none<CollaborationGraph>()
          cancelGraph(graph, reason)
          yield* persist(graph, { type: "graph.cancelled", payload: { reason: reason ?? "Cancelled by owner" } })
          return Option.some(graph)
        }),
      )
    })

    const recover: Interface["recover"] = Effect.fn("CollaborationCoordinator.recover")(function* (rootSessionID) {
      const graphs = yield* list(rootSessionID)
      const active = graphs.filter((graph) => graph.state === "planning" || graph.state === "running")
      for (const graph of active) {
        recoverInterruptedNodes(graph)
        yield* persist(graph, { type: "graph.recovered", payload: { revision: graph.revision } })
      }
      return active
    })

    const summary: Interface["summary"] = Effect.fn("CollaborationCoordinator.summary")(function* (id) {
      const graph = yield* requireGraph(id).pipe(
        Effect.map(Option.some),
        Effect.catchTag("Koda.GraphStoreError", () => Effect.succeed(Option.none())),
      )
      return Option.isSome(graph) ? Option.some(graphSummary(graph.value)) : Option.none()
    })

    const heartbeat: Interface["heartbeat"] = Effect.fn("CollaborationCoordinator.heartbeat")(
      function* (id, nodeID, progress) {
        return yield* lockFor(id).withPermit(
          Effect.gen(function* () {
            const graph = yield* requireGraph(id)
            const node = heartbeatNode(graph, nodeID, progress)
            yield* persist(graph, {
              type: "node.heartbeat",
              nodeID,
              payload: { lastHeartbeatAt: node.lastHeartbeatAt, progress: node.progress },
            })
            return Option.some(graph)
          }),
        )
      },
    )

    const recoverStale: Interface["recoverStale"] = Effect.fn("CollaborationCoordinator.recoverStale")(function* (
      id,
      staleAfterMs = 60_000,
    ) {
      return yield* lockFor(id).withPermit(
        Effect.gen(function* () {
          const graph = yield* requireGraph(id)
          const recovered = recoverStaleNodes(graph, staleAfterMs)
          if (recovered.length === 0) return Option.some(graph)
          yield* persist(graph, {
            type: "graph.stale.recovered",
            payload: { nodes: recovered.map((node) => node.id), staleAfterMs },
          })
          return Option.some(graph)
        }),
      )
    })

    return Service.of({ create, get, list, execute, cancel, recover, summary, heartbeat, recoverStale })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Database.node] })

export * as CollaborationCoordinator from "./service"
