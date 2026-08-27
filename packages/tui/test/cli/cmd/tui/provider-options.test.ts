import { describe, expect, test } from "bun:test"
import {
  buildCustomProviderConfig,
  CUSTOM_PROVIDER_CONFIG_SCOPE,
  normalizeCustomBaseURL,
  normalizeCustomModelID,
  normalizeCustomProviderID,
  normalizeCustomProviderName,
  providerOptions,
} from "../../../../src/component/dialog-provider"

describe("providerOptions", () => {
  test("persists custom providers globally so models survive restart", () => {
    expect(CUSTOM_PROVIDER_CONFIG_SCOPE).toBe("global")
  })

  test("includes a synthetic Other option for custom providers", () => {
    expect(providerOptions([{ id: "openai", name: "OpenAI" }]).at(-1)).toMatchObject({
      title: "Other",
      description: "Custom provider",
      category: "Providers",
    })
  })

  test("does not use Other as the generic provider category", () => {
    expect(providerOptions([{ id: "mistral", name: "Mistral" }])[0]?.category).toBe("Providers")
  })

  test("keeps popular providers first and sorts the rest alphabetically", () => {
    expect(
      providerOptions([
        { id: "openai", name: "OpenAI" },
        { id: "custom-z", name: "Zebra Provider" },
        { id: "anthropic", name: "Anthropic" },
        { id: "mistral", name: "Mistral" },
        { id: "aws", name: "AWS Bedrock" },
      ]).map((option) => option.value),
    ).toEqual(["anthropic", "openai", "aws", "mistral", "custom-z", "__opencode_custom_provider__"]) // koda_change - preserve koda provider priority
  })

  test("does not collide with a configured provider named other", () => {
    const values = providerOptions([{ id: "other", name: "Other Provider" }]).map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })

  test("normalizes and validates custom provider ids", () => {
    expect(normalizeCustomProviderID("  custom-provider  ")).toBe("custom-provider")
    expect(normalizeCustomProviderID("custom_provider")).toBe("custom_provider")
    expect(normalizeCustomProviderID("@ai-sdk/custom-provider")).toBe("custom-provider")
    expect(normalizeCustomProviderID("-custom-provider")).toBeUndefined()
    expect(normalizeCustomProviderID("Custom Provider")).toBeUndefined()
  })

  test("validates custom provider names and model ids", () => {
    expect(normalizeCustomProviderName("  Acme AI  ")).toBe("Acme AI")
    expect(normalizeCustomProviderName("   ")).toBeUndefined()
    expect(normalizeCustomModelID("  llama-3.3-70b  ")).toBe("llama-3.3-70b")
    expect(normalizeCustomModelID("model with spaces")).toBeUndefined()
  })

  test("accepts safe http URLs and rejects embedded credentials", () => {
    expect(normalizeCustomBaseURL("https://api.example.com/v1/")).toBe("https://api.example.com/v1")
    expect(normalizeCustomBaseURL("ftp://api.example.com")).toBeUndefined()
    expect(normalizeCustomBaseURL("https://user:secret@api.example.com/v1")).toBeUndefined()
  })

  test("builds a complete OpenAI-compatible provider config", () => {
    expect(
      buildCustomProviderConfig({
        providerID: "acme-ai",
        providerName: "Acme AI",
        modelID: "acme-chat",
        modelName: "Acme Chat",
        baseURL: "https://api.example.com/v1",
      }),
    ).toEqual({
      "acme-ai": {
        name: "Acme AI",
        api: "https://api.example.com/v1",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: "https://api.example.com/v1" },
        models: {
          "acme-chat": { id: "acme-chat", name: "Acme Chat" },
        },
      },
    })
  })
})
