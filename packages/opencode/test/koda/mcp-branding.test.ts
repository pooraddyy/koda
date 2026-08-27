import { describe, test, expect } from "bun:test"
import path from "path"
import { Schema } from "effect"
import { MCP } from "../../src/mcp"

// Regression guard for branding drift in user-facing MCP strings.
//
// History: upstream OpenCode has repeatedly overwritten the koda-branded
// toast message and MCP client `name` field during large refactors — most
// recently in upstream PR #22913 (commit 5fccdc9fc, "refactor: collapse mcp
// barrel into mcp/index.ts") which koda picked up via the v1.4.7 merge (PR
// #9346, commit 57630eaf1). The original fix was PR #7174.
//
// This test asserts the surviving koda-branded strings directly against the
// source so that the next upstream churn on this file fails the koda test
// suite instead of shipping an "opencode mcp auth" popup to end users.

const mcpSource = path.join(__dirname, "..", "..", "src", "mcp", "index.ts")

describe("koda MCP branding", () => {
  test("auth toast tells the user to run `koda mcp auth`, never `opencode mcp auth`", async () => {
    const src = await Bun.file(mcpSource).text()
    expect(src).toContain("Run: koda mcp auth ${key}")
    expect(src).not.toContain("Run: opencode mcp auth")
  })

  test("MCP status accepts bounded connection lifecycle states", () => {
    expect(Schema.decodeUnknownSync(MCP.Status)({ status: "connecting", attempt: 0 })).toEqual({
      status: "connecting",
      attempt: 0,
    })
    expect(
      Schema.decodeUnknownSync(MCP.Status)({
        status: "reconnecting",
        attempt: 2,
        message: "Retrying MCP connection (3/3)",
      }),
    ).toMatchObject({ status: "reconnecting", attempt: 2 })
    expect(() =>
      Schema.decodeUnknownSync(MCP.Status)({ status: "reconnecting", attempt: -1, message: "bad" }),
    ).toThrow()
  })

  test("MCP `Client` instances identify themselves as `koda`", async () => {
    const src = await Bun.file(mcpSource).text()
    // `name: "opencode"` is the upstream default and appears in the protocol
    // handshake / client identification fields. Any new `new Client({ ... })`
    // must use the koda brand.
    const opencodeClientName = /name:\s*"opencode"/g
    expect(src.match(opencodeClientName)).toBeNull()
  })
})
