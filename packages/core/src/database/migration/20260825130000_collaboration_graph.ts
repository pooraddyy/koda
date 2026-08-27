import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260825130000_collaboration_graph",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS koda_collaboration_graph (
          id text PRIMARY KEY NOT NULL,
          root_session_id text NOT NULL,
          mode text NOT NULL,
          state text NOT NULL,
          max_concurrency integer NOT NULL,
          revision integer NOT NULL DEFAULT 0,
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          CONSTRAINT koda_collaboration_graph_root_fk FOREIGN KEY (root_session_id) REFERENCES session(id) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS koda_collaboration_graph_root_idx ON koda_collaboration_graph (root_session_id);`,
      )
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS koda_collaboration_node (
          graph_id text NOT NULL,
          node_id text NOT NULL,
          role text NOT NULL,
          prompt text NOT NULL,
          depends_on text NOT NULL,
          mutation integer NOT NULL DEFAULT 0,
          max_attempts integer NOT NULL,
          state text NOT NULL,
          attempts integer NOT NULL DEFAULT 0,
          session_id text,
          result text,
          error text,
          started_at integer,
          finished_at integer,
          PRIMARY KEY (graph_id, node_id),
          CONSTRAINT koda_collaboration_node_graph_fk FOREIGN KEY (graph_id) REFERENCES koda_collaboration_graph(id) ON DELETE CASCADE,
          CONSTRAINT koda_collaboration_node_session_fk FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE SET NULL
        );
      `)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS koda_collaboration_node_state_idx ON koda_collaboration_node (graph_id, state);`,
      )
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS koda_collaboration_node_session_idx ON koda_collaboration_node (session_id);`,
      )
      yield* tx.run(`
        CREATE TABLE IF NOT EXISTS koda_collaboration_event (
          id text PRIMARY KEY NOT NULL,
          graph_id text NOT NULL,
          sequence integer NOT NULL,
          node_id text,
          type text NOT NULL,
          payload text NOT NULL,
          created_at integer NOT NULL,
          CONSTRAINT koda_collaboration_event_graph_fk FOREIGN KEY (graph_id) REFERENCES koda_collaboration_graph(id) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS koda_collaboration_event_sequence_idx ON koda_collaboration_event (graph_id, sequence);`,
      )
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS koda_collaboration_event_node_idx ON koda_collaboration_event (graph_id, node_id);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
