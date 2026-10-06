import { getTelegramService } from "@/telegram/service"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const connect = Effect.fn("TelegramHttpApi.connect")(
      (ctx: { payload: { token: string; adminId: string } }) => {
        const svc = getTelegramService()
        // tryPromise converts rejection to a typed failure (not a defect),
        // then we map it to a success response carrying the error message.
        return Effect.tryPromise({
          try: () => svc.connect(ctx.payload.token, ctx.payload.adminId),
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
      },
    )

    const disconnect = Effect.fn("TelegramHttpApi.disconnect")(function* () {
      const svc = getTelegramService()
      svc.disconnect()
      return { disconnected: true }
    })

    const status = Effect.fn("TelegramHttpApi.status")(function* () {
      const svc = getTelegramService()
      return {
        connected: svc.isConnected(),
        runningTasks: svc.getRunningTasks().length,
      }
    })

    return handlers.handle("connect", connect).handle("disconnect", disconnect).handle("status", status)
  }),
)
