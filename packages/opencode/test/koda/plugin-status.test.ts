import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Plugin } from "../../src/plugin"

describe("plugin lifecycle status", () => {
  test("accepts bounded loaded and failed snapshots", () => {
    expect(
      Schema.decodeUnknownSync(Plugin.Status)({
        id: "example-plugin",
        source: "external",
        state: "loaded",
      }),
    ).toEqual({ id: "example-plugin", source: "external", state: "loaded" })

    expect(
      Schema.decodeUnknownSync(Plugin.Status)({
        id: "builtin",
        source: "builtin",
        state: "failed",
        error: "failed to initialize",
      }),
    ).toMatchObject({ id: "builtin", state: "failed" })
  })

  test("rejects unbounded or unknown lifecycle values", () => {
    expect(() =>
      Schema.decodeUnknownSync(Plugin.Status)({
        id: "example-plugin",
        source: "external",
        state: "running",
      }),
    ).toThrow()
  })
})
