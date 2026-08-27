import { Effect } from "effect"
import { define } from "../internal"
import { ProviderV2 } from "../../provider" // koda_change

export const VercelPlugin = define({
  id: "vercel",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.api.type !== "aisdk") continue
          if (item.provider.api.package !== "@ai-sdk/vercel") continue
          if (item.provider.id !== ProviderV2.ID.make("vercel")) continue // koda_change
          evt.provider.update(item.provider.id, (provider) => {
            provider.request.headers["http-referer"] = "https://koda.ai/" // koda_change
            provider.request.headers["x-title"] = "koda Code" // koda_change
          })
        }
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/vercel") return
        const mod = yield* Effect.promise(() => import("@ai-sdk/vercel"))
        evt.sdk = mod.createVercel(evt.options)
      }),
    )
  }),
})
