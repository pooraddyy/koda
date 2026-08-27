import type { IndexingConfig } from "@koda/koda-indexing/config"

type Auth = unknown

type Env = {
  koda_API_KEY?: string
  koda_ORG_ID?: string
}

type Provider = {
  key?: unknown
  options?: Record<string, unknown>
}

export type kodaIndexingAuth = {
  apiKey?: string
  baseUrl?: string
  organizationId?: string
}

const providers = [
  "openai",
  "ollama",
  "openai-compatible",
  "gemini",
  "mistral",
  "vercel-ai-gateway",
  "bedrock",
  "openrouter",
  "voyage",
]

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return
  const trimmed = value.trim()
  return trimmed || undefined
}

function token(auth: Auth): string | undefined {
  const data = record(auth)
  if (data.type === "api") return text(data.key)
  if (data.type === "oauth") return text(data.access)
  return
}

function org(auth: Auth): string | undefined {
  const data = record(auth)
  if (data.type === "oauth") return text(data.accountId)
  return
}

function value(input: unknown): boolean {
  if (input === undefined || input === null) return false
  if (typeof input === "string") return input.trim().length > 0
  if (typeof input === "object") return Object.values(input).some(value)
  return true
}

function hasOtherProvider(indexing: unknown): boolean {
  const cfg = record(indexing)
  return providers.some((provider) => value(cfg[provider]))
}

export function resolvekodaIndexingAuth(input: {
  config?: unknown
  provider?: Provider
  auth?: Auth
  env?: Env
}): kodaIndexingAuth {
  const config = record(input.config)
  const options = record(record(config.provider).koda)
  const provider = input.provider ?? record(input.provider)
  const providerOptions = record(provider.options)
  const providerConfig = record(options.options)
  const koda = record(record(config.indexing).koda)
  const env = input.env ?? process.env

  return {
    apiKey:
      text(koda.apiKey) ??
      text(providerConfig.apiKey) ??
      token(input.auth) ??
      text(provider.key) ??
      text(providerOptions.kodaToken) ??
      text(env.koda_API_KEY),
    baseUrl: text(koda.baseUrl) ?? text(providerConfig.baseURL) ?? text(providerConfig.baseUrl),
    organizationId:
      text(koda.organizationId) ??
      text(providerConfig.kodaOrganizationId) ??
      org(input.auth) ??
      text(providerOptions.kodaOrganizationId) ??
      text(env.koda_ORG_ID),
  }
}

export function haskodaIndexingAuth(input: Parameters<typeof resolvekodaIndexingAuth>[0]): boolean {
  return !!resolvekodaIndexingAuth(input).apiKey
}

export function shouldDefaultIndexingTokoda(indexing: unknown, auth: kodaIndexingAuth): boolean {
  const cfg = record(indexing)
  if (cfg.provider !== undefined || !auth.apiKey) return false
  return !hasOtherProvider(cfg)
}

export function indexingWithkodaDefault(
  indexing: IndexingConfig | undefined,
  auth: kodaIndexingAuth,
): IndexingConfig | undefined {
  if (!shouldDefaultIndexingTokoda(indexing, auth)) return indexing
  return { ...indexing, provider: "koda" }
}
