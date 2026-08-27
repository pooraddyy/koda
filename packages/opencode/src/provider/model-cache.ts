// koda_change - new file
import { fetchkodaModels, type kodaModelsResult } from "@koda/koda-gateway"
import { Context, Deferred, Duration, Effect, Exit, Layer, Schema, Scope } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Config } from "../config/config"
import { Auth } from "../auth"
import type { Provider } from "@opencode-ai/core/models-dev"
import * as Log from "@opencode-ai/core/util/log"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder" // koda_change
import { httpClient } from "@opencode-ai/core/effect/app-node-platform" // koda_change

type Models = Provider["models"]
type kodaOptions = NonNullable<Parameters<typeof fetchkodaModels>[0]>
type Options = { -readonly [K in keyof kodaOptions]?: kodaOptions[K] } & { apiKey?: string }
type Failure = NonNullable<kodaModelsResult["error"]>
type Result = { readonly models: Models; readonly error?: Failure }
type View = { models?: Models; timestamp?: number }
type Flight = { readonly done: Deferred.Deferred<Result, unknown>; version: number }

export interface kodaModels {
  readonly fetch: (options: kodaOptions) => Effect.Effect<kodaModelsResult, unknown>
}

export class kodaModelsService extends Context.Service<kodaModelsService, kodaModels>()(
  "@koda/ModelCache/kodaModels",
) {}

export const kodaModelsLayer = Layer.succeed(
  kodaModelsService,
  kodaModelsService.of({ fetch: (options) => Effect.tryPromise(() => fetchkodaModels(options)) }),
)
type Cell = {
  readonly providerID: string
  readonly options: Options
  readonly view: View
  cached?: { readonly result: Result; readonly expires: number }
  flight?: Flight
}

export interface Interface {
  readonly getFailure: (providerID: string) => Effect.Effect<Failure | undefined>
  readonly failedProviders: () => Effect.Effect<string[]>
  readonly get: (providerID: string) => Effect.Effect<Models | undefined>
  readonly fetch: (providerID: string, options?: Options) => Effect.Effect<Models, unknown>
  readonly refresh: (providerID: string, options?: Options) => Effect.Effect<Models, unknown>
  readonly clear: (providerID: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@koda/ModelCache") {}

const log = Log.create({ service: "model-cache" })
const ttl = Duration.minutes(5)
const APERTIS_BASE_URL = "https://api.apertis.ai/v1"
const ApertisItem = Schema.Struct({ id: Schema.String, owned_by: Schema.optional(Schema.String) })
const ApertisResponse = Schema.Struct({ data: Schema.optional(Schema.Array(ApertisItem)) })
type ApertisItem = Schema.Schema.Type<typeof ApertisItem>

export const layer: Layer.Layer<
  Service,
  never,
  Auth.Service | Config.Service | kodaModelsService | HttpClient.HttpClient
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const cfg = yield* Config.Service
    const koda = yield* kodaModelsService
    const http = yield* HttpClient.HttpClient
    const scope = yield* Scope.Scope
    const cells = new Map<string, Cell>()
    const active = new Map<string, Cell>()
    const versions = new Map<string, number>()
    const failures = new Map<string, Failure>()

    const getFailure = Effect.fn("ModelCache.getFailure")(function* (providerID: string) {
      return failures.get(providerID)
    })

    const failedProviders = Effect.fn("ModelCache.failedProviders")(function* () {
      return [...failures.keys()]
    })

    const aperture = (item: ApertisItem): Models[string] => ({
      id: item.id,
      name: item.id,
      family: item.owned_by ?? "",
      release_date: "",
      attachment: true,
      reasoning: false,
      temperature: true,
      tool_call: true,
      cost: { input: 0, output: 0 },
      limit: { context: 128000, output: 4096 },
      modalities: { input: ["text", "image"], output: ["text"] },
    })

    const fetchApertisModels = Effect.fn("ModelCache.fetchApertisModels")(function* (options: Options) {
      const baseURL = options.baseURL ?? APERTIS_BASE_URL
      if (!options.apiKey) {
        log.debug("no API key for apertis, skipping model fetch")
        return {}
      }

      const url = `${baseURL.replace(/\/+$/, "")}/models`
      const response = yield* HttpClientRequest.get(url).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(options.apiKey),
        http.execute,
        Effect.timeout("10 seconds"),
      )
      if (response.status < 200 || response.status >= 300) {
        log.error("apertis model fetch failed", { status: response.status })
        return {}
      }

      const json = yield* HttpClientResponse.schemaBodyJson(ApertisResponse)(response)
      return Object.fromEntries((json.data ?? []).map((item) => [item.id, aperture(item)]))
    })

    const authOptions = Effect.fn("ModelCache.authOptions")(function* (providerID: string) {
      if (providerID !== "koda" && providerID !== "apertis") return {}
      const config = yield* cfg.get()
      const options: Options = {}

      if (providerID === "koda") {
        const item = config.provider?.[providerID]
        if (item?.options?.apiKey) options.kodaToken = item.options.apiKey
        if (item?.options?.kodaOrganizationId) options.kodaOrganizationId = item.options.kodaOrganizationId

        const info = yield* auth.get(providerID)
        if (info?.type === "api") options.kodaToken = info.key
        if (info?.type === "oauth") {
          options.kodaToken = info.access
          if (info.accountId) options.kodaOrganizationId = info.accountId
        }

        if (process.env.koda_API_KEY) options.kodaToken = process.env.koda_API_KEY
        if (process.env.koda_ORG_ID) options.kodaOrganizationId = process.env.koda_ORG_ID
        log.debug("auth options resolved", {
          providerID,
          hasToken: !!options.kodaToken,
          hasOrganizationId: !!options.kodaOrganizationId,
        })
      }

      if (providerID === "apertis") {
        const item = config.provider?.[providerID]
        if (item?.options?.apiKey) options.apiKey = item.options.apiKey
        if (item?.options?.baseURL) options.baseURL = item.options.baseURL

        const info = yield* auth.get(providerID)
        if (info?.type === "api") options.apiKey = info.key
        if (process.env.APERTIS_API_KEY) options.apiKey = process.env.APERTIS_API_KEY
        if (process.env.APERTIS_BASE_URL) options.baseURL = process.env.APERTIS_BASE_URL
        log.debug("apertis auth options resolved", {
          providerID,
          hasKey: !!options.apiKey,
          hasBaseURL: !!options.baseURL,
        })
      }

      return options
    })

    const fetchModels = (providerID: string, options: Options): Effect.Effect<Result, unknown> => {
      if (providerID === "koda") return koda.fetch(options)
      if (providerID === "apertis") return fetchApertisModels(options).pipe(Effect.map((models) => ({ models })))
      log.debug("provider not implemented", { providerID })
      return Effect.succeed({ models: {} })
    }

    const load = Effect.fn("ModelCache.load")(function* (providerID: string, options: Options) {
      const resolved = yield* authOptions(providerID).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            log.warn("auth options failed", { providerID, cause })
            return {}
          }),
        ),
      )
      return yield* fetchModels(providerID, { ...resolved, ...options })
    })

    const key = (providerID: string, options?: Options) => {
      if (providerID === "koda") {
        return JSON.stringify([providerID, options?.baseURL, options?.kodaOrganizationId, options?.kodaToken])
      }
      if (providerID === "apertis") return JSON.stringify([providerID, options?.baseURL, options?.apiKey])
      return providerID
    }

    const cell = Effect.fn("ModelCache.cell")(function* (providerID: string, options: Options = {}) {
      const id = key(providerID, options)
      const existing = cells.get(id)
      if (existing) return existing
      const view: View = {}
      const next: Cell = { providerID, options, view }
      cells.set(id, next)
      return next
    })

    const invalidate = (entry: Cell) =>
      Effect.sync(() => {
        entry.cached = undefined
      })

    const detach = (entry: Cell) =>
      invalidate(entry).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            entry.flight = undefined
          }),
        ),
      )

    const commit = (providerID: string, version: number, entry: Cell, result: Result) =>
      Effect.sync(() => {
        if ((versions.get(providerID) ?? 0) !== version) return result.models
        if (result.error) {
          failures.set(providerID, result.error)
          log.warn("model fetch error", { providerID, error: result.error })
        } else {
          failures.delete(providerID)
        }
        entry.view.models = result.models
        entry.view.timestamp = Date.now()
        active.set(providerID, entry)
        log.info("models fetched and cached", { providerID, count: Object.keys(result.models).length })
        return result.models
      })

    // A refresh belongs to the cache service, not the caller that happened to start it.
    const evaluate = (entry: Cell, version: number) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const cached = entry.cached
          if (cached && cached.expires > Date.now()) {
            yield* commit(entry.providerID, version, entry, cached.result)
            return cached.result
          }

          const existing = entry.flight
          if (existing) {
            existing.version = version
            return yield* restore(Deferred.await(existing.done))
          }

          const done = yield* Deferred.make<Result, unknown>()
          const flight = { done, version } satisfies Flight
          entry.flight = flight
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const exit = yield* restore(load(entry.providerID, entry.options)).pipe(Effect.exit)
              if (entry.flight === flight) {
                entry.flight = undefined
                if (Exit.isSuccess(exit)) {
                  entry.cached = { result: exit.value, expires: Date.now() + Duration.toMillis(ttl) }
                  yield* commit(entry.providerID, flight.version, entry, exit.value)
                }
              }
              yield* Deferred.done(done, exit)
            }),
          ).pipe(Effect.forkIn(scope, { startImmediately: true }))
          return yield* restore(Deferred.await(done))
        }),
      )

    const get = Effect.fn("ModelCache.get")(function* (providerID: string) {
      const entry = active.get(providerID)
      if (!entry?.view.models || entry.view.timestamp === undefined) {
        log.debug("cache miss", { providerID })
        return
      }

      const age = Date.now() - entry.view.timestamp
      if (age > Duration.toMillis(ttl)) {
        log.debug("cache expired", { providerID, age })
        entry.view.models = undefined
        entry.view.timestamp = undefined
        yield* invalidate(entry)
        return
      }

      log.debug("cache hit", { providerID, age })
      return entry.view.models
    })

    const fetch = Effect.fn("ModelCache.fetch")(function* (providerID: string, options?: Options) {
      const cached = yield* get(providerID)
      if (cached) return cached
      const version = (versions.get(providerID) ?? 0) + 1
      versions.set(providerID, version)
      const entry = yield* cell(providerID, options)
      log.info("fetching models", { providerID })
      const result = yield* evaluate(entry, version)
      return result.models
    })

    const refresh = Effect.fn("ModelCache.refresh")(function* (providerID: string, options?: Options) {
      const version = (versions.get(providerID) ?? 0) + 1
      versions.set(providerID, version)
      const entry = yield* cell(providerID, options)
      log.info("refreshing models", { providerID })
      yield* invalidate(entry)
      const result = yield* evaluate(entry, version)
      return result.models
    })

    const clear = Effect.fn("ModelCache.clear")(function* (providerID: string) {
      versions.set(providerID, (versions.get(providerID) ?? 0) + 1)
      const entries = [...cells.entries()].filter(([, entry]) => entry.providerID === providerID)
      yield* Effect.all(
        entries.map(([id, entry]) => detach(entry).pipe(Effect.tap(() => Effect.sync(() => cells.delete(id))))),
        { discard: true },
      )
      active.delete(providerID)
      failures.delete(providerID)
      if (entries.some(([, entry]) => entry.view.models)) {
        log.info("cache cleared", { providerID })
        return
      }
      log.debug("no cache to clear", { providerID })
    })

    return Service.of({ getFailure, failedProviders, get, fetch, refresh, clear })
  }),
)

export const defaultLayer: Layer.Layer<Service> = Layer.suspend(() => AppNodeBuilder.build(node)) // koda_change - build from the LayerNode graph

const kodaModels = LayerNode.make({ name: "koda-models", layer: kodaModelsLayer, deps: [] })
export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Auth.node, Config.node, kodaModels, httpClient],
})

export * as ModelCache from "./model-cache"
