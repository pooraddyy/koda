import { z } from "zod"
import { resolvekodaGatewayBaseUrl } from "./url.js"

export type kodaEmbeddingModel = {
  id: string
  name: string
  dimension: number
  scoreThreshold: number
  note?: string
}

export type kodaEmbeddingModelCatalog = {
  defaultModel: string
  models: kodaEmbeddingModel[]
  aliases: Record<string, string>
}

export type kodaEmbeddingModelCatalogIssue = {
  code: "http" | "invalid-response" | "network"
  message: string
  status?: number
}

export const EMPTY_koda_EMBEDDING_MODEL_CATALOG: kodaEmbeddingModelCatalog = {
  defaultModel: "",
  models: [],
  aliases: {},
}

const model = z.object({
  id: z.string(),
  name: z.string(),
  dimension: z.number().int().positive(),
  scoreThreshold: z.number(),
  note: z.string().optional(),
})

const catalog = z.object({
  defaultModel: z.string(),
  models: z.array(model),
  aliases: z.record(z.string(), z.string()),
})

type Options = {
  baseURL?: string
  token?: string
  signal?: AbortSignal
  attempts?: number
  onError?: (issue: kodaEmbeddingModelCatalogIssue) => void
}

const retryable = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

function wait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

export async function fetchkodaEmbeddingModelCatalog(options: Options = {}): Promise<kodaEmbeddingModelCatalog> {
  const url = new URL("embedding-models", resolvekodaGatewayBaseUrl({ baseURL: options.baseURL, token: options.token }))
  const requested = options.attempts ?? 3
  const attempts = Number.isFinite(requested) ? Math.min(3, Math.max(1, Math.floor(requested))) : 3
  const issue = { current: undefined as kodaEmbeddingModelCatalogIssue | undefined }

  for (const attempt of Array.from({ length: attempts }, (_, index) => index)) {
    if (options.signal?.aborted) throw options.signal.reason
    try {
      const response = await fetch(url, { signal: options.signal, redirect: "error" })
      if (!response.ok) {
        issue.current = {
          code: "http",
          message: `Unable to load koda embedding models (HTTP ${response.status}).`,
          status: response.status,
        }
        if (!retryable(response.status) || attempt === attempts - 1) break
        await wait(200 * 2 ** attempt, options.signal)
        continue
      }
      const body = await response.json().catch(() => undefined)
      const parsed = catalog.safeParse(body)
      if (parsed.success) return parsed.data
      issue.current = {
        code: "invalid-response",
        message: "koda returned an invalid embedding model catalog.",
      }
      break
    } catch (err) {
      if (options.signal?.aborted) throw options.signal.reason
      issue.current = {
        code: "network",
        message: "Unable to connect to koda to load embedding models. Check your network connection and try again.",
      }
      if (attempt === attempts - 1) break
      await wait(200 * 2 ** attempt, options.signal)
    }
  }

  if (issue.current) options.onError?.(issue.current)
  return EMPTY_koda_EMBEDDING_MODEL_CATALOG
}
