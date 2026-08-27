import { describe, expect, test } from "bun:test"
import path from "path"
import { kodaOauthCallbackPage } from "@opencode-ai/core/koda/oauth/page"

const root = path.join(__dirname, "..", "..")

describe("koda OAuth branding", () => {
  test("Codex OAuth browser flow uses koda branding", async () => {
    const src = await Bun.file(path.join(root, "src", "plugin", "openai", "codex.ts")).text()

    expect(src).toContain('originator: "koda"')
    expect(src).toContain('"User-Agent": `koda/${InstallationVersion}`')
    expect(src).toContain("return to koda")
    expect(src).not.toContain('originator: "opencode"')
    expect(src).not.toContain("return to OpenCode")
  })

  test("core OAuth browser flow uses koda branding", async () => {
    const src = await Bun.file(path.join(root, "..", "core", "src", "plugin", "provider", "openai.ts")).text()
    const pages = [
      kodaOauthCallbackPage.success({ provider: "ChatGPT" }),
      kodaOauthCallbackPage.error("Denied", { provider: "ChatGPT" }),
    ]

    expect(src).toContain('originator: "koda"')
    expect(src).toContain('"User-Agent": `koda/${InstallationVersion}`')
    expect(src).toContain("kodaOauthCallbackPage")
    expect(src).not.toContain('originator: "opencode"')
    for (const page of pages) {
      expect(page).toContain("· koda</title>")
      expect(page).toContain('aria-label="koda Code"')
      expect(page).toContain('viewBox="0 0 100 100"')
      expect(page).not.toContain("OpenCode")
      expect(page).not.toContain('viewBox="0 0 234 42"')
    }
  })

  test("MCP OAuth callback page uses koda branding", async () => {
    const src = await Bun.file(path.join(root, "src", "mcp", "oauth-callback.ts")).text()

    expect(src).toContain("return to koda")
    expect(src).not.toContain("return to OpenCode")
  })
})
