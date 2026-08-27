import { describe, expect, test } from "bun:test"
import { resolvekodaGatewayBaseUrl, resolvekodaOpenRouterBaseUrl } from "../../src/api/url"

describe("koda API URL resolvers", () => {
  test("resolves production route bases", () => {
    expect(resolvekodaGatewayBaseUrl()).toBe("https://api.koda.ai/api/gateway/")
    expect(resolvekodaOpenRouterBaseUrl()).toBe("https://api.koda.ai/api/openrouter/")
  })

  test("normalizes root API base overrides", () => {
    expect(resolvekodaGatewayBaseUrl({ baseURL: "https://example.test" })).toBe("https://example.test/api/gateway/")
    expect(resolvekodaOpenRouterBaseUrl({ baseURL: "https://example.test/" })).toBe(
      "https://example.test/api/openrouter/",
    )
  })

  test("replaces existing koda API route paths", () => {
    expect(resolvekodaGatewayBaseUrl({ baseURL: "https://example.test/api/openrouter/" })).toBe(
      "https://example.test/api/gateway/",
    )
    expect(resolvekodaOpenRouterBaseUrl({ baseURL: "https://example.test/api/gateway/" })).toBe(
      "https://example.test/api/openrouter/",
    )
  })

  test("preserves path prefixes before api", () => {
    expect(resolvekodaGatewayBaseUrl({ baseURL: "https://example.test/dev/api/openrouter/" })).toBe(
      "https://example.test/dev/api/gateway/",
    )
    expect(resolvekodaOpenRouterBaseUrl({ baseURL: "https://example.test/dev" })).toBe(
      "https://example.test/dev/api/openrouter/",
    )
  })

  test("strips search and hash components", () => {
    expect(resolvekodaGatewayBaseUrl({ baseURL: "https://example.test/api/openrouter/?x=1#frag" })).toBe(
      "https://example.test/api/gateway/",
    )
  })

  test("prefers token-derived URL when token contains one", () => {
    expect(resolvekodaGatewayBaseUrl({ baseURL: "https://fallback.test", token: "https://token.test:opaque" })).toBe(
      "https://token.test/api/gateway/",
    )
  })

  test("resolves child endpoint URLs", () => {
    expect(new URL("embedding-models", resolvekodaGatewayBaseUrl({ baseURL: "https://example.test" })).toString()).toBe(
      "https://example.test/api/gateway/embedding-models",
    )
  })
})
