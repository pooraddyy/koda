import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AISDK } from "@opencode-ai/core/aisdk" // koda_change
import { Catalog } from "@opencode-ai/core/catalog"
import { ModelV2 } from "@opencode-ai/core/model" // koda_change
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { ProviderPlugins } from "@opencode-ai/core/plugin/provider"
import { kodaPlugin } from "@opencode-ai/core/plugin/provider/koda"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* kodaPlugin.effect(host)
})

// koda_change start
function withEnv<A, E, R>(vars: Record<string, string | undefined>, effect: () => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]))
      for (const [key, value] of Object.entries(vars)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      return previous
    }),
    effect,
    (previous) =>
      Effect.sync(() => {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }),
  )
}
// koda_change end

describe("kodaPlugin", () => {
  it.effect("is registered so legacy referer headers can be applied", () =>
    Effect.sync(() => expect(ProviderPlugins.map((item) => item.id)).toContain(PluginV2.ID.make("koda"))),
  )

  it.effect("applies legacy referer headers only to koda", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("koda"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.koda.ai/api/gateway",
          }
          provider.request = { headers: { Existing: "value" }, body: {} }
        })
        catalog.provider.update(ProviderV2.ID.openrouter, () => {})
      })
      yield* addPlugin()
      expect((yield* catalog.provider.get(ProviderV2.ID.make("koda")))?.request.headers).toEqual({
        Existing: "value",
        "HTTP-Referer": "https://koda.ai/",
        "X-Title": "koda Code", // koda_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.openrouter))?.request.headers).toEqual({})
    }),
  )

  it.effect("uses the exact legacy koda header casing and set", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("koda"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.koda.ai/api/gateway",
          }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.provider.get(ProviderV2.ID.koda))?.request.headers).toEqual({
        "HTTP-Referer": "https://koda.ai/",
        "X-Title": "koda Code", // koda_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.make("koda")))?.request.headers).not.toHaveProperty(
        "http-referer",
      )
      expect((yield* catalog.provider.get(ProviderV2.ID.make("koda")))?.request.headers).not.toHaveProperty("x-title")
      expect((yield* catalog.provider.get(ProviderV2.ID.make("koda")))?.request.headers).not.toHaveProperty("X-Source")
    }),
  )

  it.effect("uses the legacy provider-id guard instead of endpoint package matching", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.make("koda"), (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.koda.ai/api/gateway",
          }
        })
        catalog.provider.update(ProviderV2.ID.make("custom-koda"), (provider) => {
          provider.api = { type: "aisdk", package: "koda" }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.provider.get(ProviderV2.ID.koda))?.request.headers).toEqual({
        "HTTP-Referer": "https://koda.ai/",
        "X-Title": "koda Code", // koda_change
      })
      expect((yield* catalog.provider.get(ProviderV2.ID.make("custom-koda")))?.request.headers).toEqual({})
    }),
  )

  // koda_change start
  it.effect("routes the koda catalog through the koda Gateway SDK", () =>
    withEnv({ koda_API_KEY: undefined, koda_ORG_ID: undefined }, () =>
      Effect.gen(function* () {
        const aisdk = yield* AISDK.Service
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => {
          catalog.provider.update(ProviderV2.ID.koda, (provider) => {
            provider.api = {
              type: "aisdk",
              package: "@ai-sdk/openai-compatible",
              url: "https://api.koda.ai/api/gateway",
            }
            provider.request = { headers: {}, body: { apiKey: "stored-token" } }
          })
        })
        yield* addPlugin()
        const updated = yield* catalog.provider.get(ProviderV2.ID.koda)

        expect(updated?.api).toEqual({
          type: "aisdk",
          package: "@koda/koda-gateway",
          url: "https://api.koda.ai/api/openrouter",
        })
        expect(updated?.request.body.kodaToken).toBe("stored-token")

        const result = yield* aisdk.runSDK({
          model: ModelV2.Info.make({
            ...ModelV2.Info.empty(ProviderV2.ID.koda, ModelV2.ID.make("koda-auto/free")),
            api: {
              id: ModelV2.ID.make("koda-auto/free"),
              type: "aisdk",
              package: "@koda/koda-gateway",
            },
          }),
          package: "@koda/koda-gateway",
          options: updated?.request.body ?? {},
        })
        expect(result.sdk).toBeDefined()
        expect(typeof result.sdk.languageModel).toBe("function")
        expect(typeof result.sdk.anthropic).toBe("function")
      }),
    ),
  )

  it.effect("keeps authenticated credentials ahead of inherited environment keys", () =>
    withEnv({ koda_API_KEY: "environment-token", koda_ORG_ID: "environment-org" }, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => {
          catalog.provider.update(ProviderV2.ID.koda, (provider) => {
            provider.request = {
              headers: {},
              body: { apiKey: "authenticated-token", kodaOrganizationId: "authenticated-org" },
            }
          })
        })
        yield* addPlugin()
        const result = yield* catalog.provider.get(ProviderV2.ID.koda)

        expect(result?.request.body.apiKey).toBe("authenticated-token")
        expect(result?.request.body.kodaToken).toBe("authenticated-token")
        expect(result?.request.body.kodaOrganizationId).toBe("environment-org")
      }),
    ),
  )

  it.effect("keeps anonymous koda models available without credentials", () =>
    withEnv({ koda_API_KEY: undefined, koda_ORG_ID: undefined }, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        yield* catalog.transform((catalog) => catalog.provider.update(ProviderV2.ID.koda, () => {}))
        yield* addPlugin()
        const result = yield* catalog.provider.get(ProviderV2.ID.koda)

        expect((yield* catalog.provider.available()).map((provider) => provider.id)).toContain(ProviderV2.ID.koda)
        expect(result?.request.body.apiKey).toBe("anonymous")
        expect(result?.request.body.kodaToken).toBe("anonymous")
      }),
    ),
  )
  // koda_change end
})
