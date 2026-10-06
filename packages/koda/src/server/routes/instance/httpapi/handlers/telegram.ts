import { getTelegramService } from "@/telegram/service"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const connect = Effect.fn("TelegramHttpApi.connect")((ctx: { payload: { token: string; adminId: string } }) => {
      const svc = getTelegramService()
      // Plain promise chain: Effect.promise() turns rejections into defects
      // ("Unexpected server error"). Catch here and return error in response.
      return Effect.promise(() =>
        svc
          .connect(ctx.payload.token, ctx.payload.adminId)
          .then((result) => ({
            username: result.username as string | undefined,
            connected: true,
            error: undefined as string | undefined,
          }))
          .catch((err: unknown) => ({
            username: undefined as string | undefined,
            connected: false,
            error: err instanceof Error ? err.message : "Telegram connection failed",
          })),
      )
    })

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
