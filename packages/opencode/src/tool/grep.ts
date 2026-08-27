import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import * as kodaGrep from "@/koda/tool/grep-signal-controls" // koda_change
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "Pattern to search for in file contents (regex by default)" }), // koda_change
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
  ...kodaGrep.fields, // koda_change
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: kodaGrep.describe(DESCRIPTION), // koda_change
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const limit = params.limit ?? kodaGrep.DEFAULT_LIMIT // koda_change
          const context = params.context ?? 0 // koda_change
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false },
            output: "No files found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: params.include,
              ...kodaGrep.metadata(params, limit, context), // koda_change
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = FSUtil.resolve(requested)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!info || (info.type !== "File" && info.type !== "Directory")) return empty // koda_change
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          const result = yield* ripgrep.grep({
            cwd,
            file: info?.type === "File" ? path.basename(search) : undefined, // koda_change - constrain exact-file searches
            pattern: params.pattern,
            include: params.include,
            ...kodaGrep.options(params, limit, context), // koda_change
            signal: ctx.abort, // koda_change - stop ripgrep when the tool call is cancelled
          })
          // koda_change start
          const matches = result.items
          if (matches.length === 0) return empty
          // koda_change end

          const rows = matches.map((item) => ({
            // koda_change
            path: path.resolve(
              requestedInfo?.type === "Directory" ? requested : path.dirname(requested),
              item.entry.path,
            ),
            line: item.line,
            text: item.text,
            context: item.context, // koda_change
            textTruncated: item.textTruncated, // koda_change
          }))

          const truncated = result.truncated // koda_change
          const final = rows
          if (final.length === 0) return empty

          const total = rows.filter((row) => !row.context).length // koda_change
          const hasMore = truncated // koda_change
          const output = [`Found ${total} matches${hasMore ? " (more matches available)" : ""}`]

          let current = ""
          for (const match of final) {
            if (current !== match.path) {
              if (current !== "") output.push("")
              current = match.path
              output.push(`${match.path}:`)
            }
            output.push(kodaGrep.line(match, context)) // koda_change
          }

          if (truncated) {
            output.push("")
            output.push(kodaGrep.limitNotice(limit)) // koda_change
          }
          output.push(...kodaGrep.notices(rows)) // koda_change
          if (result.partial) output.push("", "(Some paths were inaccessible.)") // koda_change

          return {
            title: params.pattern,
            metadata: {
              matches: total,
              truncated,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
