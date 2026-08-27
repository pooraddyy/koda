import { describe, expect, test } from "bun:test"
import { kodaMcpConfig } from "@/koda/cli/cmd/mcp"

const added = `{
  "permission": {
    "bash": "allow"
  },
  "mcp": {
    "linear": {
      "type": "remote",
      "url": "https://mcp.linear.app/mcp",
      "oauth": {}
    }
  },
}`

describe("kodaMcpConfig.format", () => {
  test("writes strict JSON for koda.json", () => {
    const output = kodaMcpConfig.format("/tmp/koda.json", added)

    expect(JSON.parse(output)).toEqual({
      permission: { bash: "allow" },
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          oauth: {},
        },
      },
    })
    expect(output).not.toEndWith(",\n}")
  })

  test("preserves JSONC formatting for koda.jsonc", () => {
    expect(kodaMcpConfig.format("/tmp/koda.jsonc", added)).toBe(added)
  })
})
