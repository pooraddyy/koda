import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { Part, StepFinishPart } from "@koda/sdk/v2"
import { RoutedModelMeta } from "../../src/koda/cli/cmd/tui/routes/session/routed-model-meta"
import { kodaRoutedModel } from "../../src/koda/session/routed-model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LLMAISDK } from "../../src/session/llm/ai-sdk"

describe("session routed model", () => {
  type Event = Parameters<typeof LLMAISDK.toLLMEvents>[1]

  const adapt = (events: ReadonlyArray<Event>) => {
    const state = LLMAISDK.adapterState()
    return Effect.runPromise(
      Effect.forEach(events, (event) => LLMAISDK.toLLMEvents(state, event)).pipe(Effect.map((items) => items.flat())),
    )
  }
  const unchecked = (input: unknown) => input as Event
  const reason = {
    id: "reasoning",
    sessionID: "session",
    messageID: "message",
    type: "reasoning",
    text: "thinking",
    time: { start: 0 },
  } as Part
  const text = {
    id: "text",
    sessionID: "session",
    messageID: "message",
    type: "text",
    text: "hello",
  } as Part
  const finish = (model?: StepFinishPart["model"], id = "finish") =>
    ({
      id,
      sessionID: "session",
      messageID: "message",
      type: "step-finish",
      reason: "stop",
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      model,
    }) as Part

  test("preserves finish-step response model in provider metadata", async () => {
    const events = await adapt([
      unchecked({
        type: "finish-step",
        response: { id: "response-1", timestamp: new Date(0), modelId: "openai/gpt-5.5-20260423" },
        finishReason: "stop",
        rawFinishReason: "stop",
        usage: {},
        providerMetadata: { openrouter: { routed: true }, koda: { existing: true } },
      }),
    ])

    expect(events).toHaveLength(1)
    const event = events[0]
    if (event.type !== "step-finish") throw new Error("expected step-finish")
    expect(event.providerMetadata).toEqual({
      openrouter: { routed: true },
      koda: { existing: true, routedModelID: "openai/gpt-5.5-20260423" },
    })
  })

  test("leaves finish-step metadata unchanged without a response model", async () => {
    const meta = { openrouter: { routed: true } }
    const events = await adapt([
      unchecked({
        type: "finish-step",
        response: { id: "response-1", timestamp: new Date(0) },
        finishReason: "stop",
        rawFinishReason: "stop",
        usage: {},
        providerMetadata: meta,
      }),
    ])

    expect(events).toHaveLength(1)
    const event = events[0]
    if (event.type !== "step-finish") throw new Error("expected step-finish")
    expect(event.providerMetadata).toEqual(meta)
  })

  test("shortens date-suffixed routed model ids for display", () => {
    expect(kodaRoutedModel.display("moonshotai/kimi-k2.7-code-20260612")).toBe("moonshotai/kimi-k2.7-code")
    expect(kodaRoutedModel.display("openai/gpt-5.5-2026-04-23")).toBe("openai/gpt-5.5")
    expect(kodaRoutedModel.display("openai/gpt-5.5")).toBe("openai/gpt-5.5")
  })

  test("formats routed model names for compact display", () => {
    expect(kodaRoutedModel.displayName("Qwen: Qwen3.7 Plus (20% off)")).toBe("Qwen 3.7 Plus")
    expect(kodaRoutedModel.displayName("anthropic.claude-opus-4-5-20251101-v1:0")).toBe(
      "anthropic.claude-opus-4-5-20251101-v1:0",
    )
    expect(kodaRoutedModel.displayName("moonshotai/kimi-k2.7-code")).toBe("kimi-k2.7-code")
    expect(kodaRoutedModel.displayName("o3")).toBe("o3")
  })

  test("shows compact labels only for koda auto selections", () => {
    const model = { providerID: "openai", modelID: "gpt-5.5" }
    const parts = [reason, finish(model)]

    const routed = RoutedModelMeta.info(undefined, parts, false, {
      providerID: "koda",
      modelID: "koda-auto/efficient",
    })
    expect(routed.labels.get("reasoning")).toBe("gpt-5.5")
    expect(routed.footer).toBe("gpt-5.5")
    expect(routed.consumed.has("finish")).toBe(true)

    const explicit = RoutedModelMeta.info(undefined, parts, false, {
      providerID: "openai",
      modelID: "gpt-5.5",
    })
    expect(explicit.labels.size).toBe(0)
    expect(explicit.consumed.size).toBe(0)
    expect(explicit.footer).toBeUndefined()

    const same = RoutedModelMeta.info(
      undefined,
      [reason, finish({ providerID: "koda", modelID: "koda-auto/efficient" })],
      false,
      {
        providerID: "koda",
        modelID: "koda-auto/efficient",
      },
    )
    expect(same.labels.size).toBe(0)
    expect(same.consumed.size).toBe(0)
    expect(same.footer).toBeUndefined()
  })

  test("shows compact footer labels for text-only auto selections", () => {
    const parts = [text, finish({ providerID: "qwen", modelID: "qwen/qwen3.7-plus" })]

    const routed = RoutedModelMeta.info(undefined, parts, false, {
      providerID: "koda",
      modelID: "koda-auto/efficient",
    })
    expect(routed.labels.size).toBe(0)
    expect(routed.footer).toBe("qwen 3.7-plus")
    expect(routed.consumed.has("finish")).toBe(true)
  })

  test("does not carry compact footer labels across steps", () => {
    const more = { ...reason, id: "reasoning-2" } as Part
    const parts = [
      reason,
      finish({ providerID: "qwen", modelID: "qwen/qwen3.7-plus" }, "first"),
      more,
      finish(undefined, "last"),
    ]

    const routed = RoutedModelMeta.info(undefined, parts, false, {
      providerID: "koda",
      modelID: "koda-auto/efficient",
    })
    expect(routed.labels.get("reasoning")).toBe("qwen 3.7-plus")
    expect(routed.labels.has("reasoning-2")).toBe(false)
    expect(routed.footer).toBeUndefined()
    expect(routed.consumed.has("first")).toBe(true)
    expect(routed.consumed.has("last")).toBe(false)
  })

  test("reads routed model only for selected koda auto models", () => {
    const meta = { koda: { routedModelID: "openai/gpt-5.5-20260423" } }

    expect(
      kodaRoutedModel.readAuto(meta, {
        providerID: ProviderV2.ID.koda,
        modelID: "koda-auto/efficient",
      }),
    ).toEqual({
      providerID: ProviderV2.ID.koda,
      modelID: ModelV2.ID.make("openai/gpt-5.5-20260423"),
    })

    expect(
      kodaRoutedModel.readAuto(meta, {
        providerID: ProviderV2.ID.koda,
        modelID: "openai/gpt-5.5",
      }),
    ).toBeUndefined()
    expect(
      kodaRoutedModel.readAuto(meta, {
        providerID: ProviderV2.ID.openai,
        modelID: "gpt-5.5",
      }),
    ).toBeUndefined()
  })
})
