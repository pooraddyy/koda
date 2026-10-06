import { getTelegramService } from "@/telegram/service"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const connect = Effect.fn("TelegramHttpApi.connect")(function* (ctx) {
      const svc = getTelegramService()
      const result = yield* Effect.promise(() => svc.connect(ctx.payload.token, ctx.payload.adminId))
      return { username: result.username, connected: true }
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
