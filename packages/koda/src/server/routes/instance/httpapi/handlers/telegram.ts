import { getTelegramService } from "@/telegram/service"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const connect = Effect.fn("TelegramHttpApi.connect")(function* (ctx: {
      payload: { token: string; adminId: string }
    }) {
      // Everything inside tryPromise: anything outside becomes an
      // "Unexpected server error" defect.
      const result = yield* Effect.tryPromise({
        try: () => {
          const svc = getTelegramService()
          return svc.connect(ctx.payload.token, ctx.payload.adminId)
        },
        catch: (err) => (err instanceof Error ? err : new Error("Telegram connection failed")),
      }).pipe(
        Effect.map((r) => ({
          username: r.username as string | undefined,
          connected: true,
          error: undefined as string | undefined,
        })),
        Effect.catch((err: Error) =>
          Effect.succeed({
            username: undefined as string | undefined,
            connected: false,
            error: err.message,
          }),
        ),
      )
      return result
    })

    const disconnect = Effect.fn("TelegramHttpApi.disconnect")(function* () {
      // Minimal test: no service call
      return { disconnected: true }
    })

    const status = Effect.fn("TelegramHttpApi.status")(function* () {
      // Minimal test: no service call
      return {
        connected: false,
        runningTasks: 0,
      }
    })

    return handlers.handle("connect", connect).handle("disconnect", disconnect).handle("status", status)
  }),
)
