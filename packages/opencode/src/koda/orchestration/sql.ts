import { SessionTable } from "@opencode-ai/core/session/sql"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

/** Durable graph metadata. The snapshot is authoritative for recovery; events explain how it changed. */
export const CollaborationGraphTable = sqliteTable(
  "koda_collaboration_graph",
  {
    id: text().primaryKey(),
    root_session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    mode: text().notNull(),
    state: text().notNull(),
    max_concurrency: integer().notNull(),
    revision: integer().notNull().default(0),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [index("koda_collaboration_graph_root_idx").on(table.root_session_id)],
)

export const CollaborationNodeTable = sqliteTable(
  "koda_collaboration_node",
  {
    graph_id: text()
      .notNull()
      .references(() => CollaborationGraphTable.id, { onDelete: "cascade" }),
    node_id: text().notNull(),
    role: text().notNull(),
    prompt: text().notNull(),
    depends_on: text({ mode: "json" }).$type<string[]>().notNull(),
    mutation: integer({ mode: "boolean" }).notNull().default(false),
    max_attempts: integer().notNull(),
    state: text().notNull(),
    attempts: integer().notNull().default(0),
    session_id: text().references(() => SessionTable.id, { onDelete: "set null" }),
    result: text(),
    error: text(),
    started_at: integer(),
    finished_at: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.graph_id, table.node_id] }),
    index("koda_collaboration_node_state_idx").on(table.graph_id, table.state),
    index("koda_collaboration_node_session_idx").on(table.session_id),
  ],
)

export const CollaborationEventTable = sqliteTable(
  "koda_collaboration_event",
  {
    id: text().primaryKey(),
    graph_id: text()
      .notNull()
      .references(() => CollaborationGraphTable.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    node_id: text(),
    type: text().notNull(),
    payload: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    created_at: integer().notNull(),
  },
  (table) => [
    uniqueIndex("koda_collaboration_event_sequence_idx").on(table.graph_id, table.sequence),
    index("koda_collaboration_event_node_idx").on(table.graph_id, table.node_id),
  ],
)

export type CollaborationGraphRow = typeof CollaborationGraphTable.$inferSelect
export type CollaborationNodeRow = typeof CollaborationNodeTable.$inferSelect
export type CollaborationEventRow = typeof CollaborationEventTable.$inferSelect

export * as CollaborationSql from "./sql"
