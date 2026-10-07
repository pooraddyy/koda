import { Pty } from "@koda-ai/core/pty"
import { PtyProtocol } from "@koda-ai/core/pty/protocol"
import { PtyTicket } from "@koda-ai/core/pty/ticket"
import { Location } from "@koda-ai/core/location"
import { Effect, Queue } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import * as Socket from "effect/unstable/socket/Socket"
import { Api } from "../api"
import { CorsConfig, isAllowedRequestOrigin } from "../cors"
import { ForbiddenError, PtyNotFoundError } from "@koda-ai/protocol/errors"
import {
  PTY_CONNECT_TICKET_QUERY,
  PTY_CONNECT_TOKEN_HEADER,
  PTY_CONNECT_TOKEN_HEADER_VALUE,
} from "@koda-ai/protocol/groups/pty"
import { response } from "../location"
import { PtyEnvironment } from "../pty-environment"

const ticketScope = Effect.gen(function* () {
  const location = yield* Location.Service
  return { directory: location.directory as string, workspaceID: location.workspaceID }
})

export const PtyHandler = HttpApiBuilder.group(Api, "server.pty", (handlers) =>
  Effect.gen(function* () {
    const tickets = yield* PtyTicket.Service
    const cors = yield* CorsConfig
    const environment = yield* PtyEnvironment.Service

    return handlers
      .handle(
        "pty.list",
        Effect.fn(function* () {
          return yield* response((yield* Pty.Service).list())
        }),
      )
      .handle(
        "pty.create",
        Effect.fn(function* (ctx) {
          const pty = yield* Pty.Service
          const location = yield* Location.Service
          const cwd = ctx.payload.cwd || location.directory
          return yield* response(
            pty.create({
              ...ctx.payload,
              args: ctx.payload.args ? [...ctx.payload.args] : undefined,
              cwd,
              env: {
                ...ctx.payload.env,
                ...(yield* environment.get({ directory: location.directory, cwd })),
              },
            }),
          )
        }),
      )
      .handle(
        "pty.get",
        Effect.fn(function* (ctx) {
          const pty = yield* Pty.Service
          return yield* response(
            pty.get(ctx.params.ptyID).pipe(
              Effect.catchTag(
                "Pty.NotFoundError",
                () =>
                  new PtyNotFoundError({
                    ptyID: ctx.params.ptyID,
                    message: `PTY session not found: ${ctx.params.ptyID}`,
                  }),
              ),
            ),
          )
        }),
      )
      .handle(
        "pty.update",
        Effect.fn(function* (ctx) {
          const pty = yield* Pty.Service
          return yield* response(
            pty
              .update(ctx.params.ptyID, {
                ...ctx.payload,
                size: ctx.payload.size ? { ...ctx.payload.size } : undefined,
              })
              .pipe(
                Effect.catchTag(
                  "Pty.NotFoundError",
                  () =>
                    new PtyNotFoundError({
                      ptyID: ctx.params.ptyID,
                      message: `PTY session not found: ${ctx.params.ptyID}`,
                    }),
                ),
              ),
          )
        }),
      )
      .handle(
        "pty.remove",
        Effect.fn(function* (ctx) {
          const pty = yield* Pty.Service
          yield* pty.remove(ctx.params.ptyID).pipe(
            Effect.catchTag(
              "Pty.NotFoundError",
              () =>
                new PtyNotFoundError({
                  ptyID: ctx.params.ptyID,
                  message: `PTY session not found: ${ctx.params.ptyID}`,
                }),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "pty.connectToken",
        Effect.fn(function* (ctx) {
          const request = yield* HttpServerRequest.HttpServerRequest
          // The custom header forces a CORS preflight, so cross-origin browser pages cannot
          // mint tickets without passing the server's origin policy.
          if (
            request.headers[PTY_CONNECT_TOKEN_HEADER] !== PTY_CONNECT_TOKEN_HEADER_VALUE ||
            !isAllowedRequestOrigin(request.headers.origin, request.headers.host, cors)
          )
            return yield* new ForbiddenError({ message: "Invalid PTY connect token request" })
          const pty = yield* Pty.Service
          yield* pty.get(ctx.params.ptyID).pipe(
            Effect.catchTag(
              "Pty.NotFoundError",
              () =>
                new PtyNotFoundError({
                  ptyID: ctx.params.ptyID,
                  message: `PTY session not found: ${ctx.params.ptyID}`,
                }),
            ),
          )
          return yield* response(tickets.issue({ ptyID: ctx.params.ptyID, ...(yield* ticketScope) }))
        }),
      )
      .handleRaw(
        "pty.connect",
        Effect.fn("PtyHandler.connect")(function* (ctx) {
          const pty = yield* Pty.Service

          // The auth middleware skips credential checks for ticketed URLs, so the ticket is
          // consumed before the existence check: checking existence first would let an
          // unauthenticated caller probe PTY IDs (timestamp-sequential) via 404 vs 403.
          const url = new URL(ctx.request.url, "http://localhost")
          const ticket = url.searchParams.get(PTY_CONNECT_TICKET_QUERY)
          if (ticket) {
            const valid = isAllowedRequestOrigin(ctx.request.headers.origin, ctx.request.headers.host, cors)
              ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
              : false
            if (!valid) return HttpServerResponse.empty({ status: 403 })
          }

          const exists = yield* pty.get(ctx.params.ptyID).pipe(
            Effect.as(true),
            Effect.catchTag("Pty.NotFoundError", () => Effect.succeed(false)),
          )
          if (!exists) return HttpServerResponse.empty({ status: 404 })

          const parsedCursor = url.searchParams.get("cursor")
          const cursorNumber = parsedCursor === null ? undefined : Number(parsedCursor)
          const cursor =
            cursorNumber !== undefined && Number.isSafeInteger(cursorNumber) && cursorNumber >= -1
              ? cursorNumber
              : undefined

          // A plain (non-upgrade) GET fails the upgrade with an expected HttpServerError
          // ("Not an upgradeable ServerRequest"); answer 426 Upgrade Required instead of
          // letting it die as a 500.
          const socket = yield* ctx.request.upgrade.pipe(
            Effect.catchTag("HttpServerError", () => Effect.succeed(undefined)),
          )
          if (socket === undefined) return HttpServerResponse.empty({ status: 426 })
          const write = yield* socket.writer
          const closeAccepted = (event: Socket.CloseEvent) =>
            socket
              .runRaw(() => Effect.void, { onOpen: write(event).pipe(Effect.catch(() => Effect.void)) })
              .pipe(
                Effect.timeout("1 second"),
                Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
                Effect.catch(() => Effect.void),
              )

          // Outbound frames flow through one queue drained by a single writer so replay, live
          // output, and the close frame keep their order. The queue is bounded and sliding: a
          // chatty PTY with a slow client drops the oldest frames instead of growing memory
          // without bound.
          // TODO: Integrate graceful-shutdown socket tracking before clients migrate to this route.
          const outbox = yield* Queue.sliding<string | Uint8Array | Socket.CloseEvent>(256)
          const attachment = yield* pty
            .attach(ctx.params.ptyID, {
              cursor,
              onData: (chunk) => Queue.offerUnsafe(outbox, chunk),
              onEnd: () => Queue.offerUnsafe(outbox, new Socket.CloseEvent(1000)),
            })
            .pipe(
              Effect.catchTags({
                "Pty.NotFoundError": () =>
                  closeAccepted(new Socket.CloseEvent(4404, "session not found")).pipe(Effect.as(undefined)),
                "Pty.ExitedError": () =>
                  closeAccepted(new Socket.CloseEvent(4404, "session exited")).pipe(Effect.as(undefined)),
              }),
            )
          if (!attachment) return HttpServerResponse.empty()

          // The attachment is detached by a single ensuring around the whole post-attach
          // block: replay framing, the meta frame, and activation can all throw before the
          // race below starts, and each would otherwise leak the attachment.
          yield* Effect.gen(function* () {
            for (const chunk of PtyProtocol.chunks(attachment.replay)) Queue.offerUnsafe(outbox, chunk)
            Queue.offerUnsafe(outbox, PtyProtocol.metaFrame(attachment.cursor))
            attachment.activate()

            const drain = Effect.gen(function* () {
              while (true) {
                const item = yield* Queue.take(outbox)
                yield* write(item)
                if (item instanceof Socket.CloseEvent) return
              }
            })

            yield* Effect.race(
              drain,
              socket.runRaw((message) => {
                const decoded = PtyProtocol.decodeInput(message)
                if (decoded !== undefined) attachment.write(decoded)
              }),
            ).pipe(
              Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
              Effect.orDie,
            )
          }).pipe(Effect.ensuring(Effect.sync(() => attachment.detach())))
          return HttpServerResponse.empty()
        }),
      )
  }),
)
