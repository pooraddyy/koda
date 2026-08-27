import type { DatabaseMigration } from "../migration"
import collaborationGraph from "./20260825130000_collaboration_graph"

export default {
  id: "20260825130001_collaboration_graph_repair",
  up: collaborationGraph.up,
} satisfies DatabaseMigration.Migration
