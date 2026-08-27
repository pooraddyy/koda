import { EventTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Effect } from "effect"
import { and, asc, eq, like } from "drizzle-orm"
import { describe, expect } from "bun:test"
import { testEffect } from "../lib/effect"
import { provideTmpdirProject } from "../fixture/fixture"

const sessionID = SessionID.make("ses_status_durable_test")
const it = testEffect(
  LayerNode.compile(LayerNode.group([SessionStatus.node, EventV2Bridge.node, Database.node, CrossSpawnSpawner.node])),
)

describe("durable session run status", () => {
  it.effect("persists run transitions while preserving the live status shape", () =>
    provideTmpdirProject(() =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        const database = yield* Database.Service

        yield* status.set(sessionID, { type: "busy" }, { step: 2 })
        expect(yield* status.get(sessionID)).toEqual({ type: "busy" })
        yield* status.set(sessionID, {
          type: "retry",
          attempt: 1,
          message: "Provider overloaded",
          next: Date.now() + 100,
        })
        expect(yield* status.get(sessionID)).toMatchObject({ type: "retry", attempt: 1 })
        yield* status.set(sessionID, { type: "idle" }, { reason: "completed" })
        expect(yield* status.get(sessionID)).toEqual({ type: "idle" })
        expect((yield* status.list()).size).toBe(0)

        const rows = yield* database.db
          .select({ type: EventTable.type, data: EventTable.data })
          .from(EventTable)
          .where(and(eq(EventTable.aggregate_id, sessionID), like(EventTable.type, "session.next.run.status.%")))
          .orderBy(asc(EventTable.seq))
          .all()
        expect(rows).toHaveLength(3)
        expect(rows.map((row) => row.type)).toEqual([
          "session.next.run.status.1",
          "session.next.run.status.1",
          "session.next.run.status.1",
        ])
        expect(rows[0]?.data).toMatchObject({ state: "busy", step: 2 })
        expect(rows[1]?.data).toMatchObject({ state: "retrying", attempt: 1 })
        expect(rows[2]?.data).toMatchObject({ state: "completed", reason: "completed" })
        expect((rows[0]?.data as { runID: string }).runID).toBe((rows[1]?.data as { runID: string }).runID)
        expect((rows[1]?.data as { runID: string }).runID).toBe((rows[2]?.data as { runID: string }).runID)
      }),
    ),
  )
})
