import { CollaborationEventTable } from "../../../src/koda/orchestration/sql"
import { CollaborationCoordinator } from "../../../src/koda/orchestration/service"
import { SessionID } from "../../../src/session/schema"
import { Database } from "@opencode-ai/core/database/database"
import { ProjectV2 } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { and, asc, eq } from "drizzle-orm"
import { describe, expect } from "bun:test"
import { provideTmpdirProject, requireInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

const it = testEffect(
  LayerNode.compile(LayerNode.group([CollaborationCoordinator.node, Database.node, CrossSpawnSpawner.node])),
)

describe("collaboration coordinator liveness", () => {
  it.effect("persists node heartbeat progress during execution", () =>
    provideTmpdirProject(() =>
      Effect.gen(function* () {
        const coordinator = yield* CollaborationCoordinator.Service
        const database = yield* Database.Service
        const instance = yield* requireInstance
        const projectID = ProjectV2.ID.make(instance.project.id)
        const rootSessionID = SessionID.make(`ses_liveness_${crypto.randomUUID().slice(0, 8)}`)
        yield* database.db
          .insert(ProjectTable)
          .values({
            id: projectID,
            worktree: AbsolutePath.make(instance.project.worktree),
            vcs: instance.project.vcs,
            name: null,
            time_created: Date.now(),
            time_updated: Date.now(),
            sandboxes: [],
          })
          .onConflictDoNothing()
          .run()
        yield* database.db
          .insert(SessionTable)
          .values({
            id: rootSessionID,
            project_id: projectID,
            slug: rootSessionID,
            directory: instance.project.worktree,
            title: "liveness test",
            version: "test",
            time_created: Date.now(),
            time_updated: Date.now(),
          })
          .run()
        const graphID = `graph_liveness_${crypto.randomUUID().slice(0, 8)}`
        const graph = yield* coordinator.create({
          id: graphID,
          rootSessionID,
          mode: "focused",
          nodes: [{ id: "worker", role: "builder", prompt: "build", maxAttempts: 2 }],
        })

        const completed = yield* coordinator.execute(graph.id, (_node, heartbeat) =>
          Effect.gen(function* () {
            yield* heartbeat("writing implementation")
            return "implemented"
          }),
        )
        expect(completed.state).toBe("completed")
        expect(completed.nodes.get("worker")?.state).toBe("completed")

        const rows = yield* database.db
          .select({ type: CollaborationEventTable.type, payload: CollaborationEventTable.payload })
          .from(CollaborationEventTable)
          .where(
            and(eq(CollaborationEventTable.graph_id, graph.id), eq(CollaborationEventTable.type, "node.heartbeat")),
          )
          .orderBy(asc(CollaborationEventTable.sequence))
          .all()
        expect(rows).toHaveLength(1)
        expect(rows[0]?.payload).toMatchObject({ progress: "writing implementation" })

        const summary = yield* coordinator.summary(graph.id)
        expect(summary._tag).toBe("Some")
        if (summary._tag === "Some") {
          expect(summary.value.nodes[0]).toMatchObject({ id: "worker", state: "completed", result: "implemented" })
        }
      }),
    ),
  )
})
