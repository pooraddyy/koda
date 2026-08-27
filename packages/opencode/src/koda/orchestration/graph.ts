import { Schema } from "effect"

export const GraphNodeState = Schema.Literals([
  "pending",
  "ready",
  "running",
  "completed",
  "failed",
  "cancelled",
  "blocked",
])
export type GraphNodeState = Schema.Schema.Type<typeof GraphNodeState>

export const GraphState = Schema.Literals(["planning", "running", "completed", "failed", "cancelled"])
export type GraphState = Schema.Schema.Type<typeof GraphState>

export type CollaborationNode = {
  readonly id: string
  readonly role: string
  readonly prompt: string
  readonly dependsOn: string[]
  readonly mutation: boolean
  readonly maxAttempts: number
  state: GraphNodeState
  attempts: number
  sessionID?: string
  result?: string
  error?: string
  startedAt?: number
  finishedAt?: number
  lastHeartbeatAt?: number
  progress?: string
}

export type CollaborationGraph = {
  readonly id: string
  readonly rootSessionID: string
  readonly mode: string
  readonly maxConcurrency: number
  state: GraphState
  createdAt: number
  updatedAt: number
  revision: number
  nodes: Map<string, CollaborationNode>
}

export type GraphNodeInput = {
  readonly id: string
  readonly role: string
  readonly prompt: string
  readonly dependsOn?: readonly string[]
  readonly mutation?: boolean
  readonly maxAttempts?: number
}

export class GraphError extends Error {
  readonly code: "duplicate_node" | "missing_dependency" | "cycle" | "invalid_transition" | "limit"

  constructor(code: GraphError["code"], message: string) {
    super(message)
    this.name = "GraphError"
    this.code = code
  }
}

const terminal: ReadonlySet<GraphNodeState> = new Set(["completed", "failed", "cancelled", "blocked"])

function assertSafeID(value: string, label: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)) {
    throw new GraphError(
      "limit",
      `${label} must be 1-64 characters and contain only letters, numbers, dot, underscore, or dash`,
    )
  }
}

function assertAcyclic(nodes: Map<string, CollaborationNode>) {
  const active = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string) => {
    if (active.has(id)) throw new GraphError("cycle", `Collaboration graph contains a dependency cycle at ${id}`)
    if (visited.has(id)) return
    active.add(id)
    const node = nodes.get(id)
    if (!node) throw new GraphError("missing_dependency", `Unknown graph node ${id}`)
    for (const dependency of node.dependsOn) visit(dependency)
    active.delete(id)
    visited.add(id)
  }

  for (const id of nodes.keys()) visit(id)
}

function now() {
  return Date.now()
}

function touch(graph: CollaborationGraph, timestamp: number) {
  graph.updatedAt = timestamp
  graph.revision += 1
}

export function createCollaborationGraph(input: {
  id: string
  rootSessionID: string
  mode: string
  maxConcurrency?: number
  nodes: readonly GraphNodeInput[]
  createdAt?: number
}): CollaborationGraph {
  assertSafeID(input.id, "Graph id")
  if (input.nodes.length === 0) throw new GraphError("limit", "Collaboration graph must contain at least one node")
  if (input.nodes.length > 64) throw new GraphError("limit", "Collaboration graph cannot contain more than 64 nodes")
  const maxConcurrency = input.maxConcurrency ?? 2
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 16) {
    throw new GraphError("limit", "maxConcurrency must be an integer between 1 and 16")
  }

  const nodes = new Map<string, CollaborationNode>()
  for (const inputNode of input.nodes) {
    assertSafeID(inputNode.id, "Node id")
    if (nodes.has(inputNode.id)) throw new GraphError("duplicate_node", `Duplicate graph node ${inputNode.id}`)
    const dependsOn = [...new Set(inputNode.dependsOn ?? [])]
    if (dependsOn.includes(inputNode.id)) throw new GraphError("cycle", `Node ${inputNode.id} cannot depend on itself`)
    const maxAttempts = inputNode.maxAttempts ?? 1
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
      throw new GraphError("limit", `Node ${inputNode.id} maxAttempts must be between 1 and 3`)
    }
    nodes.set(inputNode.id, {
      id: inputNode.id,
      role: inputNode.role,
      prompt: inputNode.prompt,
      dependsOn,
      mutation: inputNode.mutation === true,
      maxAttempts,
      state: dependsOn.length === 0 ? "ready" : "pending",
      attempts: 0,
    })
  }

  for (const node of nodes.values()) {
    for (const dependency of node.dependsOn) {
      if (!nodes.has(dependency)) {
        throw new GraphError("missing_dependency", `Node ${node.id} depends on missing node ${dependency}`)
      }
    }
  }
  assertAcyclic(nodes)

  const timestamp = input.createdAt ?? now()
  return {
    id: input.id,
    rootSessionID: input.rootSessionID,
    mode: input.mode,
    maxConcurrency,
    state: "planning",
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
    nodes,
  }
}

export function startGraph(graph: CollaborationGraph, timestamp = now()) {
  if (graph.state !== "planning")
    throw new GraphError("invalid_transition", `Graph ${graph.id} is already ${graph.state}`)
  graph.state = "running"
  touch(graph, timestamp)
  return refreshReadyNodes(graph, timestamp)
}

export function refreshReadyNodes(graph: CollaborationGraph, timestamp = now()) {
  for (const node of graph.nodes.values()) {
    if (node.state !== "pending") continue
    const dependencies = node.dependsOn.map((id) => graph.nodes.get(id) as CollaborationNode)
    if (
      dependencies.some(
        (dependency) =>
          dependency.state === "failed" || dependency.state === "cancelled" || dependency.state === "blocked",
      )
    ) {
      node.state = "blocked"
      node.error = "A dependency did not complete successfully"
      node.finishedAt = timestamp
      continue
    }
    if (dependencies.every((dependency) => dependency.state === "completed")) node.state = "ready"
  }
  touch(graph, timestamp)
  return readyNodes(graph)
}

export function readyNodes(graph: CollaborationGraph) {
  const running = [...graph.nodes.values()].filter((node) => node.state === "running").length
  const capacity = Math.max(0, graph.maxConcurrency - running)
  return [...graph.nodes.values()]
    .filter((node) => node.state === "ready")
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, capacity)
}

export function startNode(graph: CollaborationGraph, id: string, sessionID?: string, timestamp = now()) {
  const node = graph.nodes.get(id)
  if (!node) throw new GraphError("missing_dependency", `Unknown graph node ${id}`)
  if (node.state !== "ready")
    throw new GraphError("invalid_transition", `Node ${id} is not ready; current state is ${node.state}`)
  if (node.mutation && [...graph.nodes.values()].some((item) => item.state === "running" && item.mutation)) {
    throw new GraphError("limit", "Mutation-capable collaboration nodes are serialized")
  }
  node.state = "running"
  node.attempts += 1
  node.sessionID = sessionID
  node.startedAt = timestamp
  node.lastHeartbeatAt = timestamp
  node.progress = undefined
  node.error = undefined
  touch(graph, timestamp)
  return node
}

export function completeNode(graph: CollaborationGraph, id: string, result: string, timestamp = now()) {
  const node = graph.nodes.get(id)
  if (!node) throw new GraphError("missing_dependency", `Unknown graph node ${id}`)
  if (node.state !== "running") throw new GraphError("invalid_transition", `Node ${id} is not running`)
  node.state = "completed"
  node.result = result
  node.finishedAt = timestamp
  node.lastHeartbeatAt = timestamp
  touch(graph, timestamp)
  refreshReadyNodes(graph, timestamp)
  finalizeGraph(graph, timestamp)
  return node
}

export function heartbeatNode(graph: CollaborationGraph, id: string, progress?: string, timestamp = now()) {
  const node = graph.nodes.get(id)
  if (!node) throw new GraphError("missing_dependency", `Unknown graph node ${id}`)
  if (node.state !== "running") throw new GraphError("invalid_transition", `Node ${id} is not running`)
  node.lastHeartbeatAt = timestamp
  if (progress !== undefined) node.progress = progress.trim().slice(0, 2_000)
  touch(graph, timestamp)
  return node
}

export function recoverStaleNodes(graph: CollaborationGraph, staleAfterMs: number, timestamp = now()) {
  if (!Number.isInteger(staleAfterMs) || staleAfterMs < 1_000 || staleAfterMs > 86_400_000)
    throw new GraphError("limit", "staleAfterMs must be an integer between 1000 and 86400000")
  const recovered: CollaborationNode[] = []
  for (const node of graph.nodes.values()) {
    if (node.state !== "running") continue
    const lastActivity = node.lastHeartbeatAt ?? node.startedAt ?? timestamp
    if (timestamp - lastActivity < staleAfterMs) continue
    recovered.push(failNode(graph, node.id, `Node heartbeat expired after ${staleAfterMs}ms`, timestamp))
  }
  return recovered
}

export function failNode(graph: CollaborationGraph, id: string, error: string, timestamp = now()) {
  const node = graph.nodes.get(id)
  if (!node) throw new GraphError("missing_dependency", `Unknown graph node ${id}`)
  if (node.state !== "running") throw new GraphError("invalid_transition", `Node ${id} is not running`)
  node.error = error
  node.finishedAt = timestamp
  node.lastHeartbeatAt = timestamp
  if (node.attempts < node.maxAttempts) {
    node.state = "ready"
    node.startedAt = undefined
  } else {
    node.state = "failed"
    node.startedAt = undefined
    node.lastHeartbeatAt = undefined
    node.progress = undefined
  }
  touch(graph, timestamp)
  refreshReadyNodes(graph, timestamp)
  finalizeGraph(graph, timestamp)
  return node
}

export function recoverInterruptedNodes(graph: CollaborationGraph, timestamp = now()) {
  if (terminalGraph(graph.state)) return graph
  let recovered = false
  for (const node of graph.nodes.values()) {
    if (node.state !== "running") continue
    node.state = "ready"
    node.error = "Recovered after an interrupted coordinator process; the node will run again"
    node.startedAt = undefined
    node.lastHeartbeatAt = undefined
    node.progress = undefined
    recovered = true
  }
  if (recovered) touch(graph, timestamp)
  refreshReadyNodes(graph, timestamp)
  return graph
}

export function cancelGraph(graph: CollaborationGraph, reason = "Cancelled by owner", timestamp = now()) {
  if (terminalGraph(graph.state)) return graph
  graph.state = "cancelled"
  for (const node of graph.nodes.values()) {
    if (!terminal.has(node.state)) {
      node.state = "cancelled"
      node.error = reason
      node.finishedAt = timestamp
    }
  }
  touch(graph, timestamp)
  return graph
}

export function finalizeGraph(graph: CollaborationGraph, timestamp = now()) {
  if (graph.state === "cancelled") return graph
  const nodes = [...graph.nodes.values()]
  if (nodes.every((node) => node.state === "completed")) graph.state = "completed"
  else if (nodes.some((node) => node.state === "failed" || node.state === "blocked")) graph.state = "failed"
  touch(graph, timestamp)
  return graph
}

function terminalGraph(state: GraphState) {
  return state === "completed" || state === "failed" || state === "cancelled"
}

export function graphSummary(graph: CollaborationGraph) {
  const counts = Object.fromEntries([...GraphNodeState.literals].map((state) => [state, 0])) as Record<
    GraphNodeState,
    number
  >
  for (const node of graph.nodes.values()) counts[node.state] += 1
  return {
    id: graph.id,
    mode: graph.mode,
    state: graph.state,
    maxConcurrency: graph.maxConcurrency,
    revision: graph.revision,
    total: graph.nodes.size,
    counts,
    nodes: [...graph.nodes.values()].map((node) => ({
      id: node.id,
      role: node.role,
      state: node.state,
      attempts: node.attempts,
      sessionID: node.sessionID,
      error: node.error,
      result: node.result?.slice(0, 2_000),
      startedAt: node.startedAt,
      finishedAt: node.finishedAt,
      lastHeartbeatAt: node.lastHeartbeatAt,
      progress: node.progress,
    })),
  }
}
