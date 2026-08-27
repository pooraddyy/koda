import { Effect, Schema } from "effect"
import { Instance } from "@/koda/instance"
import * as Tool from "@/tool/tool"
import { MemoryPaths } from "@koda/koda-memory/effect/paths"
import { EvolutionStore } from "@/koda/evolution/store"

const Parameters = Schema.Struct({
  action: Schema.Literals(["learn", "recall", "status"]).annotate({
    description: "Learn a verified reusable lesson, recall matching lessons, or inspect evolution status.",
  }),
  lesson: Schema.optional(
    Schema.String.check(Schema.isMaxLength(2_000)).annotate({
      description: "A concise reusable lesson learned from this project. Required for learn.",
    }),
  ),
  evidence: Schema.optional(
    Schema.String.check(Schema.isMaxLength(1_000)).annotate({
      description: "Short evidence such as a test, compiler result, or observed failure that supports the lesson.",
    }),
  ),
  query: Schema.optional(
    Schema.String.check(Schema.isMaxLength(240)).annotate({
      description: "Terms to search for matching project lessons. Required for recall.",
    }),
  ),
  confidence: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1)).annotate({
      description: "Confidence from 0 to 1. Use a lower value when evidence is incomplete.",
    }),
  ),
})

type Metadata = {
  action: string
  created?: boolean
  count: number
}

function root() {
  return MemoryPaths.root({
    ctx: { directory: Instance.directory, worktree: Instance.worktree },
  })
}

export const SelfEvolveTool = Tool.define<typeof Parameters, Metadata, never, "koda_evolve">(
  "koda_evolve",
  Effect.succeed({
    description:
      "Persist and reuse safe project lessons from verified coding work. Use learn after a meaningful success, failure, correction, or discovered project convention. Use recall before repeating a relevant past investigation. This tool only changes the bounded lesson store; it never edits source code, tools, permissions, hooks, or project configuration.",
    parameters: Parameters,
    execute: (params, ctx) =>
      Effect.tryPromise({
        try: async () => {
          const location = root()
          if (params.action === "learn") {
            const result = await EvolutionStore.learn({
              root: location,
              scope: Instance.directory,
              lesson: params.lesson ?? "",
              evidence: params.evidence,
              confidence: params.confidence,
              sourceSessionID: ctx.sessionID,
            })
            return {
              title: result.created ? "Evolution lesson learned" : "Evolution lesson reinforced",
              output: `${result.created ? "Saved" : "Updated"} a reusable project lesson. ${result.total} lesson${result.total === 1 ? "" : "s"} retained.`,
              metadata: { action: "learn", created: result.created, count: result.total },
            }
          }
          if (params.action === "recall") {
            const results = await EvolutionStore.search(location, params.query ?? "")
            const output = results.length
              ? results
                  .map((item) => `- ${item.lesson}${item.evidence ? ` (evidence: ${item.evidence})` : ""}`)
                  .join("\n")
              : "No matching project lessons found."
            return {
              title: "Evolution lessons recalled",
              output,
              metadata: { action: "recall", count: results.length },
            }
          }
          const lessons = await EvolutionStore.list(location)
          return {
            title: "Evolution status",
            output: `${lessons.length} bounded project lesson${lessons.length === 1 ? "" : "s"} retained at ${EvolutionStore.location(location)}.`,
            metadata: { action: "status", count: lessons.length },
          }
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  }),
)
