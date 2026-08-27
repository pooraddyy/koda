// koda_change - new file
import { describe, expect, test } from "bun:test"
import { TelemetryEvent } from "@koda/koda-telemetry"

describe("TelemetryEvent.FEEDBACK_SUBMITTED", () => {
  test("enum value is human-readable title case", () => {
    expect(String(TelemetryEvent.FEEDBACK_SUBMITTED)).toBe("Feedback Submitted")
  })
})
