import { Auth } from "@/auth"
// koda_change start
import {
  invalidateAfterProviderAuthChange,
  invalidatePresence,
} from "@/koda/server/provider-auth-lifecycle"
// koda_change end
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { remove as removeAuth } from "@/koda/auth/remove" // koda_change

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: Auth.Info
    }) {
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      // koda_change start - drop old presence socket before instance disposal on koda auth changes
      if (ctx.params.providerID === "koda") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // koda_change end
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
    }) {
      // koda_change start
      yield* removeAuth(ctx.params.providerID)
      if (ctx.params.providerID === "koda") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // koda_change end
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const write =
        ctx.payload.level === "debug"
          ? Effect.logDebug
          : ctx.payload.level === "info"
            ? Effect.logInfo
            : ctx.payload.level === "warn"
              ? Effect.logWarning
              : Effect.logError
      yield* write(ctx.payload.message).pipe(Effect.annotateLogs(ctx.payload.extra ?? {}))
      return true
    })

    return handlers.handle("authSet", authSet).handle("authRemove", authRemove).handle("log", log)
  }),
)
