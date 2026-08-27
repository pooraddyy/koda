import { describe, expect, test } from "bun:test"
import { kodaSessionProcessor } from "../../src/koda/session/processor"

describe("session generation id", () => {
  test("extracts a bounded Gateway generation id", () => {
    expect(
      kodaSessionProcessor.generationID({
        gateway: {
          generationId: " gen_test-123 ",
          routing: { finalProvider: "novita" },
          marketCost: "0.1",
        },
      }),
    ).toBe("gen_test-123")
  })

  test("rejects arbitrary or oversized metadata values", () => {
    expect(kodaSessionProcessor.generationID({ gateway: { generationId: "request-secret" } })).toBeUndefined()
    expect(kodaSessionProcessor.generationID({ gateway: { generationId: `gen_${"a".repeat(201)}` } })).toBeUndefined()
    expect(kodaSessionProcessor.generationID({ gateway: { generationId: 42 } })).toBeUndefined()
    expect(kodaSessionProcessor.generationID({ openai: { responseId: "gen_response" } })).toBeUndefined()
  })
})
