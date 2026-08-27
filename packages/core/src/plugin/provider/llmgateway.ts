import { Effect } from "effect"
import { define } from "../internal"
import { Integration } from "../../integration"
import { ProviderV2 } from "../../provider" // koda_change

export const LLMGatewayPlugin = define({
  id: "llmgateway",
  effect: Effect.fn(function* (ctx) {
    const integrations = yield* Integration.Service
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        for (const item of evt.provider.list()) {
          if (item.provider.disabled) continue
          if (item.provider.api.type !== "aisdk") continue
          if (item.provider.api.package !== "@ai-sdk/openai-compatible") continue
          if (item.provider.api.url !== "https://api.llmgateway.io/v1") continue
          if (item.provider.id !== ProviderV2.ID.make("llmgateway")) continue // koda_change
          if (!(yield* integrations.get(Integration.ID.make(item.provider.id)))) continue
          evt.provider.update(item.provider.id, (provider) => {
            provider.request.headers["HTTP-Referer"] = "https://koda.ai/"
            // koda_change start
            provider.request.headers["X-Title"] = "koda Code"
            provider.request.headers["X-Source"] = "koda"
            // koda_change end
          })
        }
      }),
    )
  }),
})
