import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { Provider as SDK } from "ai"
import type { kodaProviderOptions } from "./types.js"
import { getApiKey } from "./auth/token.js"
import { buildkodaHeaders, getDefaultHeaders } from "./headers.js"
import { ANONYMOUS_API_KEY } from "./api/constants.js"
import { resolvekodaOpenRouterBaseUrl } from "./api/url.js"
import { buildRequestHeaders } from "./provider.js"

/**
 * Debug version of createkoda with extensive logging
 */
export function createkodaDebug(options: kodaProviderOptions = {}): SDK {
  console.log("\n🔍 [koda DEBUG] Creating koda Provider")
  console.log("📋 [koda DEBUG] Options received:", JSON.stringify(options, null, 2))

  // Get API key from options or environment
  const apiKey = getApiKey(options)
  console.log("🔑 [koda DEBUG] API Key extracted:")
  console.log("  - Source:", options.kodaToken ? "kodaToken" : options.apiKey ? "apiKey" : "none")
  console.log("  - Value:", apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}` : "MISSING!")

  const openRouterUrl = resolvekodaOpenRouterBaseUrl({ baseURL: options.baseURL, token: apiKey })
  console.log("🔗 [koda DEBUG] OpenRouter URL:", openRouterUrl)

  // Merge custom headers with defaults
  const customHeaders = {
    ...getDefaultHeaders(),
    ...buildkodaHeaders(undefined, {
      kodaOrganizationId: options.kodaOrganizationId,
      kodaTesterWarningsDisabledUntil: undefined,
    }),
    ...options.headers,
  }
  console.log("📝 [koda DEBUG] Custom headers:", JSON.stringify(customHeaders, null, 2))

  // Create custom fetch wrapper to add dynamic headers
  const originalFetch = options.fetch ?? fetch
  const wrappedFetch = async (input: string | URL | Request, init?: RequestInit) => {
    console.log("\n🚀 [koda DEBUG] Making request:")
    console.log("  - URL:", String(input))
    console.log("  - Method:", init?.method || "GET")

    const headers = buildRequestHeaders(customHeaders, init?.headers)

    // Add authorization if API key exists
    if (apiKey) {
      const authValue = `Bearer ${apiKey}`
      headers.set("Authorization", authValue)
      console.log(
        "  - Authorization header set:",
        `Bearer ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 8)}`,
      )
    } else {
      console.log("  ⚠️ - NO AUTHORIZATION HEADER! API key is missing")
    }

    console.log("  - Headers being sent:")
    headers.forEach((value, key) => {
      if (key.toLowerCase() === "authorization") {
        console.log(`    ${key}: ${value.substring(0, 20)}...`)
      } else {
        console.log(`    ${key}: ${value}`)
      }
    })

    const response = await originalFetch(input, {
      ...init,
      headers,
    })

    console.log("  - Response status:", response.status, response.statusText)

    if (!response.ok) {
      const responseText = await response.text()
      console.log("  ❌ - Error response:", responseText)
      // Re-create response since we consumed the body
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    return response
  }

  console.log("✅ [koda DEBUG] Creating OpenRouter provider with configuration\n")

  // Create OpenRouter provider with koda configuration
  return createOpenRouter({
    baseURL: openRouterUrl,
    apiKey: apiKey ?? ANONYMOUS_API_KEY,
    headers: customHeaders,
    fetch: wrappedFetch as typeof fetch,
  }) as unknown as SDK
}
