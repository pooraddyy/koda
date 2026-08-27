import { createkoda, koda_OPENROUTER_BASE } from "@koda/koda-gateway" // koda_change
import { Effect } from "effect"
import { ProviderV2 } from "../../provider" // koda_change
import { define } from "../internal"

const id = ProviderV2.ID.koda // koda_change

export const kodaPlugin = define({
  id: "koda",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.id !== id) continue // koda_change
          evt.provider.update(item.provider.id, (provider) => {
            // koda_change start
            const options = provider.request.body
            const token = options.kodaToken ?? options.apiKey ?? process.env.koda_API_KEY
            const org = process.env.koda_ORG_ID ?? options.kodaOrganizationId

            provider.api = {
              type: "aisdk",
              package: "@koda/koda-gateway",
              url: koda_OPENROUTER_BASE,
            }
            // koda_change end
            provider.request.headers["HTTP-Referer"] = "https://koda.ai/"
            // koda_change start
            provider.request.headers["X-Title"] = "koda Code"
            options.apiKey = token ?? "anonymous"
            options.kodaToken = options.apiKey
            if (org) options.kodaOrganizationId = org
            // koda_change end
          })
        }
      }),
    )
    // koda_change start
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== id) return
        evt.sdk = createkoda(evt.options)
      }),
    )
    // koda_change end
  }),
})
