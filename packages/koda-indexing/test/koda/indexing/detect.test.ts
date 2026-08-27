import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { hasIndexingPlugin, isIndexingPlugin, normalizePluginName } from "../../../src/detect"

describe("indexing plugin detection", () => {
  test("bundles detect module for browser targets", async () => {
    const dir = await mkdtemp(`${tmpdir()}/koda-indexing-detect-`)
    const result = await Bun.build({
      entrypoints: [fileURLToPath(new URL("../../../src/detect.ts", import.meta.url))],
      minify: true,
      outdir: dir,
      target: "browser",
    })

    expect(result.success).toBe(true)
  })

  test("normalizes supported plugin forms", () => {
    expect(normalizePluginName("koda-indexing")).toBe("koda-indexing")
    expect(normalizePluginName("koda-indexing@1.2.3")).toBe("koda-indexing")
    expect(normalizePluginName("@koda/koda-indexing")).toBe("@koda/koda-indexing")
    expect(normalizePluginName("@koda/koda-indexing@1.2.3")).toBe("@koda/koda-indexing")
    expect(normalizePluginName("../../packages/koda-indexing")).toBe("@koda/koda-indexing")
    expect(normalizePluginName("file:///tmp/.opencode/plugin/koda-indexing.js")).toBe("koda-indexing")
    expect(normalizePluginName("file:///tmp/node_modules/@koda/koda-indexing/index.js")).toBe(
      "@koda/koda-indexing",
    )
    expect(normalizePluginName("file:///tmp/repo/packages/koda-indexing/src/index.ts")).toBe("@koda/koda-indexing")
  })

  test("detects supported indexing plugin specifiers", () => {
    const values = [
      "koda-indexing",
      "koda-indexing@1.2.3",
      "@koda/koda-indexing",
      "@koda/koda-indexing@1.2.3",
      "../../packages/koda-indexing",
      "file:///tmp/.opencode/plugin/koda-indexing.js",
      "file:///tmp/node_modules/@koda/koda-indexing/index.js",
      "file:///tmp/repo/packages/koda-indexing/src/index.ts",
    ]

    for (const value of values) {
      expect(isIndexingPlugin(value)).toBe(true)
    }
  })

  test("ignores unrelated plugin specifiers", () => {
    expect(isIndexingPlugin("@koda/koda-gateway")).toBe(false)
    expect(isIndexingPlugin("file:///tmp/.opencode/plugin/index.js")).toBe(false)
    expect(hasIndexingPlugin(["@koda/koda-gateway", "foo@1.0.0"])).toBe(false)
  })

  test("detects indexing plugin in merged plugin lists", () => {
    expect(
      hasIndexingPlugin(["@koda/koda-gateway", "file:///tmp/node_modules/@koda/koda-indexing/index.js"]),
    ).toBe(true)
  })
})
