import { describe, expect, it } from "bun:test"
import {
  cancelGraph,
  completeNode,
  createCollaborationGraph,
  failNode,
  graphSummary,
  heartbeatNode,
  readyNodes,
  refreshReadyNodes,
  recoverInterruptedNodes,
  recoverStaleNodes,
  startGraph,
  startNode,
} from "@/koda/orchestration/graph"
import { COLLABORATION_MODES, planCollaboration } from "@/koda/orchestration/modes"

function graph() {
  return createCollaborationGraph({
    id: "graph-test",
    rootSessionID: "session-root",
    mode: "parallel",
    maxConcurrency: 2,
    nodes: [
      { id: "scout", role: "scout", prompt: "inspect" },
      { id: "risk", role: "architect", prompt: "analyze" },
      {
        id: "build",
        role: "builder",
        prompt: "implement",
        dependsOn: ["scout", "risk"],
        mutation: true,
        maxAttempts: 2,
      },
      { id: "verify", role: "verifier", prompt: "verify", dependsOn: ["build"] },
    ],
    createdAt: 1,
  })
}

describe("collaboration graph", () => {
  it("rejects duplicate, missing, and cyclic dependencies", () => {
    expect(() =>
      createCollaborationGraph({
        id: "duplicate",
        rootSessionID: "root",
        mode: "focused",
        nodes: [
          { id: "same", role: "scout", prompt: "one" },
          { id: "same", role: "scout", prompt: "two" },
        ],
      }),
    ).toThrow("Duplicate")
    expect(() =>
      createCollaborationGraph({
        id: "missing",
        rootSessionID: "root",
        mode: "focused",
        nodes: [{ id: "child", role: "scout", prompt: "child", dependsOn: ["unknown"] }],
      }),
    ).toThrow("missing")
    expect(() =>
      createCollaborationGraph({
        id: "cycle",
        rootSessionID: "root",
        mode: "focused",
        nodes: [
          { id: "a", role: "scout", prompt: "a", dependsOn: ["b"] },
          { id: "b", role: "scout", prompt: "b", dependsOn: ["a"] },
        ],
      }),
    ).toThrow("cycle")
  })

  it("releases dependent nodes only after every dependency completes", () => {
    const item = graph()
    startGraph(item, 2)
    expect(refreshReadyNodes(item, 3).map((node) => node.id)).toEqual(["risk", "scout"])
    startNode(item, "scout", "child-scout", 4)
    startNode(item, "risk", "child-risk", 5)
    completeNode(item, "scout", "files", 6)
    expect(refreshReadyNodes(item, 7).map((node) => node.id)).toEqual([])
    completeNode(item, "risk", "risks", 8)
    expect(refreshReadyNodes(item, 9).map((node) => node.id)).toEqual(["build"])
  })

  it("retries a failed node within its attempt budget and blocks descendants after exhaustion", () => {
    const item = graph()
    startGraph(item, 2)
    startNode(item, "scout", "scout-child", 3)
    startNode(item, "risk", "risk-child", 4)
    completeNode(item, "scout", "files", 5)
    completeNode(item, "risk", "risks", 6)
    startNode(item, "build", "builder-child", 7)
    failNode(item, "build", "transient", 8)
    expect(item.nodes.get("build")?.state).toBe("ready")
    startNode(item, "build", "builder-child-2", 9)
    failNode(item, "build", "permanent", 10)
    expect(item.nodes.get("build")?.state).toBe("failed")
    expect(item.nodes.get("verify")?.state).toBe("blocked")
    expect(item.state).toBe("failed")
  })

  it("serializes mutation workers and cancels the full graph", () => {
    const item = graph()
    startGraph(item, 2)
    startNode(item, "scout", "scout-child", 3)
    startNode(item, "risk", "risk-child", 4)
    completeNode(item, "scout", "files", 5)
    completeNode(item, "risk", "risks", 6)
    startNode(item, "build", "builder-child", 7)
    expect(() => startNode(item, "build", "builder-child-2", 8)).toThrow("not ready")
    cancelGraph(item, "owner stopped", 9)
    expect(item.state).toBe("cancelled")
    expect([...item.nodes.values()].every((node) => ["completed", "cancelled"].includes(node.state))).toBe(true)
  })

  it("tracks bounded node heartbeat progress", () => {
    const item = graph()
    startGraph(item, 2)
    startNode(item, "scout", "child-scout", 3)
    heartbeatNode(item, "scout", "  scanning source files  ", 4)
    const node = item.nodes.get("scout")
    expect(node?.lastHeartbeatAt).toBe(4)
    expect(node?.progress).toBe("scanning source files")
    expect(() => heartbeatNode(item, "scout", "x".repeat(2_001), 5)).not.toThrow()
    expect(item.nodes.get("scout")?.progress).toHaveLength(2_000)
    expect(() => heartbeatNode(item, "risk", "not running", 6)).toThrow("not running")
  })

  it("reconciles stale nodes through the existing attempt budget", () => {
    const item = graph()
    startGraph(item, 2)
    startNode(item, "scout", "child-scout", 3)
    const recovered = recoverStaleNodes(item, 1_000, 1_004)
    expect(recovered.map((node) => node.id)).toEqual(["scout"])
    expect(item.nodes.get("scout")?.state).toBe("failed")
    expect(item.nodes.get("scout")?.error).toContain("heartbeat expired")
    expect(() => recoverStaleNodes(item, 999, 1_004)).toThrow("between 1000 and 86400000")
  })

  it("recovers interrupted nodes without losing the graph", () => {
    const item = graph()
    startGraph(item, 2)
    startNode(item, "scout", "child-scout", 3)
    const before = item.revision
    recoverInterruptedNodes(item, 4)
    expect(item.state).toBe("running")
    expect(item.nodes.get("scout")?.state).toBe("ready")
    expect(item.nodes.get("scout")?.sessionID).toBe("child-scout")
    expect(item.nodes.get("scout")?.error).toContain("Recovered")
    expect(item.revision).toBeGreaterThan(before)
    expect(readyNodes(item).map((node) => node.id)).toContain("scout")
  })

  it("summarizes mode plans deterministically", () => {
    for (const mode of Object.keys(COLLABORATION_MODES) as Array<keyof typeof COLLABORATION_MODES>) {
      const nodes = planCollaboration(mode, "ship feature")
      expect(nodes.length).toBeGreaterThan(0)
      expect(nodes.length).toBeLessThanOrEqual(COLLABORATION_MODES[mode].maxNodes)
    }
    expect(graphSummary(graph()).counts.ready).toBe(2)
  })
})
