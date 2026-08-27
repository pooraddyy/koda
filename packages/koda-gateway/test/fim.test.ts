import { describe, expect, test } from "bun:test"
import { resolveFimTarget } from "../src/fim"

describe("FIM target resolution", () => {
  test("keeps gateway autocomplete models on koda Gateway", () => {
    expect(resolveFimTarget("koda", "mistralai/codestral-2508")).toEqual({
      provider: "koda",
      model: "mistralai/codestral-2508",
      url: "https://api.koda.ai/api/fim/completions",
    })
    expect(resolveFimTarget("koda", "inception/mercury-edit-2")).toEqual({
      provider: "koda",
      model: "inception/mercury-edit-2",
      url: "https://api.koda.ai/api/fim/completions",
    })
  })

  test("routes explicit provider autocomplete models directly", () => {
    expect(resolveFimTarget("mistral", "codestral-2508")).toEqual({
      provider: "mistral",
      model: "codestral-2508",
    })
    expect(resolveFimTarget("inception", "mercury-edit-2")).toEqual({
      provider: "inception",
      model: "mercury-edit-2",
      url: "https://api.inceptionlabs.ai/v1/fim/completions",
    })
  })

  test("preserves gateway model pass-through behavior", () => {
    expect(resolveFimTarget()).toEqual({
      provider: "koda",
      model: "mistralai/codestral-2501",
      url: "https://api.koda.ai/api/fim/completions",
    })
    expect(resolveFimTarget(undefined, "mistralai/codestral-2508")).toEqual({
      provider: "koda",
      model: "mistralai/codestral-2508",
      url: "https://api.koda.ai/api/fim/completions",
    })
    expect(resolveFimTarget(undefined, "inception/mercury-edit")).toEqual({
      provider: "koda",
      model: "inception/mercury-edit",
      url: "https://api.koda.ai/api/fim/completions",
    })
    expect(resolveFimTarget("koda", "custom/fim-model")).toEqual({
      provider: "koda",
      model: "custom/fim-model",
      url: "https://api.koda.ai/api/fim/completions",
    })
  })
})
