import { FileSystem } from "@koda-ai/core/filesystem"
import { RelativePath } from "@koda-ai/core/schema"
import { InvalidRequestError } from "@koda-ai/protocol/errors"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const FileSystemHandler = HttpApiBuilder.group(Api, "server.fs", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handleRaw("fs.read", (ctx) =>
        Effect.gen(function* () {
          const rawPath = new URL(ctx.request.url, "http://localhost").pathname.slice(13)
          // decodeURIComponent throws URIError on malformed percent-encoding. fs.read declares
          // no endpoint errors, so yielding InvalidRequestError would encode against Schema.Never
          // and die as a 500; answer 400 directly instead.
          const decoded = yield* Effect.try({
            try: () => decodeURIComponent(rawPath),
            catch: () => new InvalidRequestError({ message: `Invalid percent-encoding in path: ${rawPath}` }),
          }).pipe(
            Effect.catchTag("InvalidRequestError", (error) =>
              Effect.succeed<string | HttpServerResponse.HttpServerResponse>(
                HttpServerResponse.text(error.message, { status: 400 }),
              ),
            ),
          )
          if (typeof decoded !== "string") return decoded
          const file = yield* (yield* FileSystem.Service).read({
            path: RelativePath.make(decoded),
          })
          return HttpServerResponse.uint8Array(file.content, { contentType: file.mime })
        }),
      )
      .handle("fs.list", (ctx) =>
        response(
          Effect.gen(function* () {
            const fs = yield* FileSystem.Service
            return yield* fs.list(ctx.query)
          }),
        ),
      )
      .handle("fs.find", (ctx) =>
        response(
          Effect.gen(function* () {
            const fs = yield* FileSystem.Service
            return yield* fs.find(ctx.query)
          }),
        ),
      )
  }),
)
