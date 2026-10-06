import * as Tool from "./tool"
import DESCRIPTION from "./telegram.txt"
import { getTelegramService } from "@/telegram/service"
import { Config } from "@/config/config"
import { Effect, Schema } from "effect"

const id = "telegram"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["connect", "disconnect", "send", "status"]).annotate({
    description: "Action to perform: connect, disconnect, send message, or check status",
  }),
  token: Schema.optional(Schema.String).annotate({
    description: "Bot token from @BotFather (required for connect)",
  }),
  adminId: Schema.optional(Schema.String).annotate({
    description: "Your Telegram user ID (required for connect)",
  }),
  chatId: Schema.optional(Schema.String).annotate({
    description: "Chat ID to send message to (required for send)",
  }),
  message: Schema.optional(Schema.String).annotate({
    description: "Message text to send (required for send)",
  }),
})

export const TelegramTool = Tool.define(
  id,
  Effect.gen(function* () {
    const run = Effect.fn("TelegramTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      _ctx: Tool.Context,
    ) {
      const svc = getTelegramService()

      switch (params.action) {
        case "connect": {
          if (!params.token || !params.adminId) {
            return yield* Effect.fail(new Error("connect requires token and adminId"))
          }
          const result = yield* Effect.tryPromise({
            try: () => svc.connect(params.token!, params.adminId!),
            catch: (e) => new Error(`Failed to connect: ${e instanceof Error ? e.message : "unknown"}`),
          })
          return {
            title: "Telegram connected",
            metadata: {},
            output: result.username ? `Connected to Telegram bot @${result.username}` : "Connected to Telegram bot",
          }
        }

        case "disconnect": {
          svc.disconnect()
          return {
            title: "Telegram disconnected",
            metadata: {},
            output: "Telegram bot disconnected.",
          }
        }

        case "send": {
          if (!params.chatId || !params.message) {
            return yield* Effect.fail(new Error("send requires chatId and message"))
          }
          yield* Effect.tryPromise({
            try: () => svc.sendMessage(params.chatId!, params.message!),
            catch: (e) => new Error(`Failed to send: ${e instanceof Error ? e.message : "unknown"}`),
          })
          return {
            title: "Message sent",
            metadata: {},
            output: `Message sent to ${params.chatId}`,
          }
        }

        case "status": {
          const connected = svc.isConnected()
          const running = svc.getRunningTasks()
          return {
            title: "Telegram status",
            metadata: {},
            output: connected
              ? `Connected. ${running.length} active research task(s).`
              : "Not connected. Use action=connect with token and adminId.",
          }
        }
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
