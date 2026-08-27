import { describe, expect, test } from "bun:test"
import { CHAT_ACTIVITY_STAGES, chatActivityLabel, nextChatActivityIndex } from "@/cli/cmd/run/chat-activity"

describe("Koda chat activity", () => {
  test("cycles to the next phrase and wraps at the end", () => {
    expect(nextChatActivityIndex(0)).toBe(1)
    expect(nextChatActivityIndex(CHAT_ACTIVITY_STAGES.length - 1)).toBe(0)
  })

  test("normalizes invalid and negative phrase indexes", () => {
    expect(chatActivityLabel(-1)).toBe(CHAT_ACTIVITY_STAGES.at(-1))
    expect(chatActivityLabel(CHAT_ACTIVITY_STAGES.length + 1)).toBe(CHAT_ACTIVITY_STAGES[1])
    expect(chatActivityLabel(Number.NaN)).toBe(CHAT_ACTIVITY_STAGES[0])
  })

  test("keeps every activity phrase user-readable", () => {
    for (const phrase of CHAT_ACTIVITY_STAGES) {
      expect(phrase.length).toBeGreaterThan(8)
      expect(phrase).not.toContain("...")
    }
  })
})
