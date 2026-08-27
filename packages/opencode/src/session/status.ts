import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventTable } from "@opencode-ai/core/event/sql"
import { Database } from "@opencode-ai/core/database/database"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { InstanceState } from "@/effect/instance-state"
import { SessionID } from "./schema"
import { DateTime, Effect, Layer, Context, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionStatusEvent } from "@opencode-ai/schema/session-status-event"
import { and, asc, desc, eq, like } from "drizzle-orm"

export const Info = SessionStatusEvent.Info
export type Info = SessionStatusEvent.Info

export const Event = SessionStatusEvent
export type RunStatusReason = SessionEvent.RunStatusReason

export type SetOptions = {
  readonly runID?: string
  readonly reason?: RunStatusReason
  readonly attempt?: number
  readonly step?: number
  readonly message?: string
}

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Map<SessionID, Info>>
  readonly set: (sessionID: SessionID, status: Info, options?: SetOptions) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionStatus") {}

const runStatusType = `${SessionEvent.RunStatus.type}.%`
const decodeRunStatus = Schema.decodeUnknownSync(SessionEvent.RunStatus.data)
const activeStates = new Set<SessionEvent.RunStatusState>(["busy", "retrying", "offline"])

const activeInfo = (status: SessionEvent.RunStatus) => {
  if (status.state === "retrying") {
    return {
      type: "retry" as const,
      attempt: status.attempt ?? 0,
      message: status.message ?? "Retrying provider request",
      next: status.next ?? Date.now(),
    }
  }
  return { type: "busy" as const }
}

const terminalState = (reason: RunStatusReason): SessionEvent.RunStatusState => {
  switch (reason) {
    case "completed":
    case "recovered":
      return "completed"
    case "blocked":
      return "blocked"
    case "failed":
    case "budget":
      return "failed"
    case "cancelled":
    case "superseded":
      return "interrupted"
  }
  return "failed"
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const statusEvents = yield* EventV2Bridge.Service
    const database = yield* Database.Service

    const state = yield* InstanceState.make(
      Effect.fn("SessionStatus.state")(() => Effect.succeed(new Map<SessionID, { info: Info; runID: string }>())),
    )

    const latest = Effect.fn("SessionStatus.latestDurableRunStatus")(function* (sessionID: SessionID) {
      const row = yield* database.db
        .select({ data: EventTable.data })
        .from(EventTable)
        .where(and(eq(EventTable.aggregate_id, sessionID), like(EventTable.type, runStatusType)))
        .orderBy(desc(EventTable.seq))
        .limit(1)
        .get()
        .pipe(Effect.orDie)
      if (!row) return undefined
      return decodeRunStatus(row.data)
    })

    const latestDurableStatuses = Effect.fn("SessionStatus.latestDurableStatuses")(function* () {
      const rows = yield* database.db
        .select({ data: EventTable.data, aggregateID: EventTable.aggregate_id })
        .from(EventTable)
        .where(like(EventTable.type, runStatusType))
        .orderBy(asc(EventTable.seq))
        .all()
        .pipe(Effect.orDie)
      const result = new Map<SessionID, SessionEvent.RunStatus>()
      for (const row of rows) {
        const status = decodeRunStatus(row.data)
        result.set(status.sessionID, status)
      }
      return result
    })

    const get = Effect.fn("SessionStatus.get")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      const current = data.get(sessionID)
      if (current) return current.info
      const persisted = yield* latest(sessionID)
      if (!persisted || !activeStates.has(persisted.state)) return { type: "idle" as const }
      const info = activeInfo(persisted)
      data.set(sessionID, { info, runID: persisted.runID })
      return info
    })

    const list = Effect.fn("SessionStatus.list")(function* () {
      const data = yield* InstanceState.get(state)
      const persisted = yield* latestDurableStatuses()
      for (const [sessionID, status] of persisted) {
        if (data.has(sessionID) || !activeStates.has(status.state)) continue
        data.set(sessionID, { info: activeInfo(status), runID: status.runID })
      }
      return new Map(Array.from(data, ([sessionID, value]) => [sessionID, value.info]))
    })

    const set = Effect.fn("SessionStatus.set")(function* (sessionID: SessionID, info: Info, options: SetOptions = {}) {
      const data = yield* InstanceState.get(state)
      const existing = data.get(sessionID)
      const persisted = existing ? undefined : yield* latest(sessionID)
      const runID =
        options.runID ??
        existing?.runID ??
        (persisted && activeStates.has(persisted.state) ? persisted.runID : undefined) ??
        `run_${crypto.randomUUID()}`
      const durableState =
        info.type === "idle" && options.reason
          ? terminalState(options.reason)
          : info.type === "retry"
            ? "retrying"
            : info.type
      const attempt = options.attempt ?? (info.type === "retry" ? info.attempt : undefined)
      const message = options.message ?? (info.type === "retry" ? info.message : undefined)
      const next = info.type === "retry" ? info.next : undefined

      yield* statusEvents.publish(Event.Status, { sessionID, status: info })
      if (info.type === "idle") yield* statusEvents.publish(Event.Idle, { sessionID })
      yield* statusEvents.publish(SessionEvent.RunStatus, {
        sessionID,
        timestamp: yield* DateTime.now,
        runID,
        state: durableState,
        ...(options.reason === undefined ? {} : { reason: options.reason }),
        ...(attempt === undefined ? {} : { attempt }),
        ...(options.step === undefined ? {} : { step: options.step }),
        ...(message === undefined ? {} : { message }),
        ...(next === undefined ? {} : { next }),
      })

      if (info.type === "idle") {
        data.delete(sessionID)
        return
      }
      data.set(sessionID, { info, runID })
    })

    return Service.of({ get, list, set })
  }),
)

// koda_change - preserve legacy layer composition for koda callers
export const defaultLayer = layer.pipe(Layer.provide(EventV2Bridge.defaultLayer))

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [EventV2Bridge.node, Database.node],
})

export * as SessionStatus from "./status"
