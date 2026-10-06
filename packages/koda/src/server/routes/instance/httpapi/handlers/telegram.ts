import { getTelegramService } from "@/telegram/service"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const connect = Effect.fn("TelegramHttpApi.connect")(function* (ctx) {
      const svc = getTelegramService()
      try {
        const result = yield* Effect.promise(() => svc.connect(ctx.payload.token, ctx.payload.adminId))
        return { username: result.username, connected: true, error: undefined as string | undefined }
      } catch (err) {
        // Return error in response instead of throwing, so TUI gets the actual message
        return {
          username: undefined as string | undefined,
          connected: false,
          error: err instanceof Error ? err.message : "Telegram connection failed",
        }
      }
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
