// Regression test: OAuth accountId must flow into model fetch as kodaOrganizationId
// When a user logs in via OAuth and selects an enterprise organization, the model fetch
// should use the organization-specific endpoint, not the personal endpoint.

import { expect } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import * as Log from "@opencode-ai/core/util/log"

Log.init({ print: false })

import { Auth } from "../../src/auth"
import { ModelCache } from "../../src/provider/model-cache"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

type Options = Parameters<ModelCache.kodaModels["fetch"]>[0]

function layer(info: Auth.Info | undefined, captured: Ref.Ref<Options | undefined>) {
  const auth = Layer.mock(Auth.Service)({
    get: (id) => Effect.succeed(id === "koda" ? info : undefined),
  })
  const models = Layer.succeed(
    ModelCache.kodaModelsService,
    ModelCache.kodaModelsService.of({
      fetch: (options) =>
        Ref.set(captured, options).pipe(
          Effect.as({
            models: {
              "test-model": {
                id: "test-model",
                name: "Test Model",
                cost: { input: 0.001, output: 0.002 },
                limit: { context: 128000, output: 4096 },
              },
            },
          }),
        ),
    }),
  )
  return Layer.fresh(ModelCache.layer).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(TestConfig.layer()),
    Layer.provide(auth),
    Layer.provide(models),
  )
}

const it = testEffect(Layer.empty)

it.live("model fetch uses accountId from OAuth auth as kodaOrganizationId", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make<Options | undefined>(undefined)
    const info = new Auth.Oauth({
      type: "oauth",
      access: "test-oauth-token",
      refresh: "test-refresh-token",
      expires: Date.now() + 3600000,
      accountId: "org-enterprise-123",
    })
    yield* ModelCache.Service.use((cache) => cache.fetch("koda")).pipe(Effect.provide(layer(info, captured)))
    expect(yield* Ref.get(captured)).toMatchObject({
      kodaToken: "test-oauth-token",
      kodaOrganizationId: "org-enterprise-123",
    })
  }),
)

it.live("model fetch without OAuth accountId does not set kodaOrganizationId", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make<Options | undefined>(undefined)
    const info = new Auth.Oauth({
      type: "oauth",
      access: "test-personal-token",
      refresh: "test-refresh-token",
      expires: Date.now() + 3600000,
    })
    yield* ModelCache.Service.use((cache) => cache.fetch("koda")).pipe(Effect.provide(layer(info, captured)))
    expect(yield* Ref.get(captured)).toMatchObject({ kodaToken: "test-personal-token" })
    expect((yield* Ref.get(captured))?.kodaOrganizationId).toBeUndefined()
  }),
)

it.live("ModelCache.clear removes cached entry so next fetch hits the network", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make<Options | undefined>(undefined)
    const info = new Auth.Oauth({
      type: "oauth",
      access: "token-clear-test",
      refresh: "refresh-clear",
      expires: Date.now() + 3600000,
      accountId: "org-clear",
    })
    yield* ModelCache.Service.use((cache) =>
      Effect.gen(function* () {
        yield* cache.fetch("koda")
        expect(yield* Ref.get(captured)).toBeDefined()

        yield* Ref.set(captured, undefined)
        yield* cache.fetch("koda")
        expect(yield* Ref.get(captured)).toBeUndefined()
        expect(yield* cache.get("koda")).toBeDefined()

        yield* cache.clear("koda")
        expect(yield* cache.get("koda")).toBeUndefined()

        yield* cache.fetch("koda")
        expect(yield* Ref.get(captured)).toBeDefined()
      }),
    ).pipe(Effect.provide(layer(info, captured)))
  }),
)
