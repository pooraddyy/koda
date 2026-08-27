import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Provider } from "../../src/provider/provider"
import { patchModelsDevModel } from "../../src/koda/provider/provider"

describe("koda provider model metadata", () => {
  test("preserves Auto Efficient routing models from Models.dev data", () => {
    const patch = patchModelsDevModel("koda", {
      autoRouting: { models: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4.6"] },
    })

    expect(patch.autoRouting).toEqual({
      models: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4.6"],
    })
  })

  test("Provider.Model schema accepts Auto Efficient routing models", () => {
    const model = Schema.decodeUnknownSync(Provider.Model)({
      id: "koda-auto/efficient",
      providerID: "koda",
      api: { id: "koda", url: "https://koda.ai", npm: "@koda/koda-gateway" },
      name: "koda Auto Efficient",
      family: "koda-auto",
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolcall: true,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 128000, output: 16384 },
      status: "active",
      options: {},
      headers: {},
      release_date: "2026-06-26",
      variants: {},
      autoRouting: { models: ["google/gemini-2.5-flash"] },
    })

    expect(model.autoRouting).toEqual({ models: ["google/gemini-2.5-flash"] })
  })
})
