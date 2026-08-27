import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

const script = join(import.meta.dir, "..", "..", "bin", "koda")
const platform = process.platform === "win32" ? "windows" : process.platform
const binary = platform === "windows" ? "koda.exe" : "koda"

describe("bin/koda tree-sitter resources", () => {
  async function setup(root: string, nested: boolean) {
    const dir = nested
      ? join(root, "node_modules", "@koda-code", `cli-${platform}-${process.arch}`, "bin")
      : join(root, "node_modules", "@koda-code", "cli", "bin")
    const wasm = join(dir, "tree-sitter")
    const bin = join(dir, nested ? binary : ".koda")
    const log = join(root, nested ? "nested-env.txt" : "cached-env.txt")

    await mkdir(wasm, { recursive: true })
    await writeFile(join(wasm, "tree-sitter.wasm"), "wasm")
    await writeFile(bin, "binary")

    return { bin, log, wasm, wrapper: join(dir, "koda") }
  }

  async function run(root: string, bin: string | undefined, log: string, wrapper?: string, failCached?: boolean) {
    const capture = `
const { EventEmitter } = require("events")
const kodaFs = require("fs")
const kodaChild = require("child_process")
const log = process.argv[1]
const wrapper = process.argv[2]
const failCached = process.argv[3] === "true"
const realpathSync = kodaFs.realpathSync
kodaFs.realpathSync = (file) => file === __filename ? wrapper || process.cwd() : realpathSync(file)
kodaChild.spawn = (target) => {
  if (failCached && target.endsWith(".koda")) throw new Error("cached binary failed")
  kodaFs.writeFileSync(log, process.env.koda_TREE_SITTER_WASM_DIR || "")
  const child = new EventEmitter()
  child.kill = () => {}
  process.nextTick(() => child.emit("exit", 0))
  return child
}
`
    const source = (await Bun.file(script).text()).replace(/^#!.*\n/, "")
    return Bun.spawnSync(
      ["node", "--input-type=commonjs", "--eval", capture + source, log, wrapper ?? "", String(failCached)],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH ?? "",
          ...(bin ? { koda_BIN_PATH: bin } : {}),
        },
      },
    )
  }

  test("exports co-located tree-sitter WASM dir for optional package binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "koda-bin-tree-sitter-"))
    try {
      const item = await setup(root, true)
      const proc = await run(root, item.bin, item.log)

      expect(proc.exitCode).toBe(0)
      expect(await Bun.file(item.log).text()).toBe(item.wasm)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("exports co-located tree-sitter WASM dir for cached postinstall binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "koda-bin-tree-sitter-"))
    try {
      const item = await setup(root, false)
      const proc = await run(root, undefined, item.log, item.wrapper)

      expect(proc.exitCode).toBe(0)
      expect(await Bun.file(item.log).text()).toBe(item.wasm)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("falls back to the optional package when the cached binary cannot spawn", async () => {
    const root = await mkdtemp(join(tmpdir(), "koda-bin-tree-sitter-"))
    try {
      const cached = await setup(root, false)
      const item = await setup(root, true)
      const proc = await run(root, undefined, item.log, cached.wrapper, true)

      expect(proc.exitCode).toBe(0)
      expect(await Bun.file(item.log).text()).toBe(cached.wasm)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
