import { describe, expect, test } from "bun:test"
import {
  haskodaIndexingAuth,
  resolvekodaIndexingAuth,
  shouldDefaultIndexingTokoda,
} from "../../src/koda/indexing-auth"

describe("koda indexing auth resolution", () => {
  test("detects auth from explicit indexing koda config", () => {
    const auth = resolvekodaIndexingAuth({
      config: { indexing: { koda: { apiKey: "idx-token", baseUrl: "https://idx.test", organizationId: "org_idx" } } },
    })

    expect(auth).toEqual({ apiKey: "idx-token", baseUrl: "https://idx.test", organizationId: "org_idx" })
    expect(haskodaIndexingAuth({ config: { indexing: { koda: { apiKey: "idx-token" } } } })).toBe(true)
  })

  test("detects auth from provider config, provider state, auth storage, and env", () => {
    expect(
      resolvekodaIndexingAuth({ config: { provider: { koda: { options: { apiKey: "cfg-token" } } } } }).apiKey,
    ).toBe("cfg-token")
    expect(resolvekodaIndexingAuth({ provider: { options: { kodaToken: "provider-token" } } }).apiKey).toBe(
      "provider-token",
    )
    expect(resolvekodaIndexingAuth({ auth: { type: "oauth", access: "oauth-token", accountId: "org_oauth" } })).toEqual(
      {
        apiKey: "oauth-token",
        organizationId: "org_oauth",
      },
    )
    expect(resolvekodaIndexingAuth({ env: { koda_API_KEY: "env-token", koda_ORG_ID: "org_env" } })).toEqual({
      apiKey: "env-token",
      organizationId: "org_env",
    })
  })

  test("defaults to koda only when no provider or other embedder config is present", () => {
    const auth = { apiKey: "koda-token" }

    expect(shouldDefaultIndexingTokoda({}, auth)).toBe(true)
    expect(shouldDefaultIndexingTokoda({ provider: "openai" }, auth)).toBe(false)
    expect(shouldDefaultIndexingTokoda({ openai: { apiKey: "openai-key" } }, auth)).toBe(false)
    expect(shouldDefaultIndexingTokoda({ ollama: { baseUrl: "http://localhost:11434" } }, auth)).toBe(false)
  })
})
