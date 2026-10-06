import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { described } from "./metadata"

const root = "/telegram"

const TelegramConnectInput = Schema.Struct({
  token: Schema.String,
  adminId: Schema.String,
}).annotate({ identifier: "TelegramConnectInput" })

const TelegramConnectResult = Schema.Struct({
  username: Schema.optional(Schema.String),
  connected: Schema.Boolean,
}).annotate({ identifier: "TelegramConnectResult" })

const TelegramStatusResult = Schema.Struct({
  connected: Schema.Boolean,
  runningTasks: Schema.Number,
}).annotate({ identifier: "TelegramStatusResult" })

export const TelegramApi = HttpApi.make("telegram").add(
  HttpApiGroup.make("telegram")
    .add(
      HttpApiEndpoint.post("connect", `${root}/connect`, {
        payload: TelegramConnectInput,
        success: described(TelegramConnectResult, "Telegram connected"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "telegram.connect",
          summary: "Connect Telegram bot",
          description: "Connect a Telegram bot with token and admin ID.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("disconnect", `${root}/disconnect`, {
        success: described(Schema.Struct({ disconnected: Schema.Boolean }), "Telegram disconnected"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "telegram.disconnect",
          summary: "Disconnect Telegram bot",
          description: "Disconnect the Telegram bot.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("status", `${root}/status`, {
        success: described(TelegramStatusResult, "Telegram status"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "telegram.status",
          summary: "Get Telegram status",
          description: "Get Telegram bot connection status.",
        }),
      ),
    )
    // Telegram is a process-wide integration, not a project instance service.
    // Status/connect must work even when the current directory is not an initialized project.
    .middleware(Authorization),
)
