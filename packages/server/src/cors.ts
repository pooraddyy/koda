import { Context } from "effect"

const kodaOrigin = /^https:\/\/([a-z0-9-]+\.)*koda\.ai$/

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@koda/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (isLoopbackOrigin(input)) return true
  if (kodaOrigin.test(input)) return true
  return opts?.cors?.includes(input) ?? false
}

// `startsWith("http://localhost:")` is bypassable, so parse and compare the hostname
// instead.
function isLoopbackOrigin(input: string) {
  try {
    const url = new URL(input)
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  } catch {
    return false
  }
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
