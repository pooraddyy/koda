import { describe, expect, test } from "bun:test"
import { kodaPtySelfCommand } from "../../src/koda/pty/self-command"

describe("pty self-command", () => {
  test("does not forward bundled bun entrypoints", () => {
    const proc = {
      argv: ["/tmp/koda", "/$bunfs/root/src/index.js"],
      execArgv: ["--user-agent=koda/test", "--use-system-ca", "--"],
      execPath: "/tmp/koda",
      cwd: "/tmp",
    }

    const cmd = kodaPtySelfCommand.command(proc)
    expect(cmd).toStrictEqual({ command: "/tmp/koda", args: [] })
    expect(kodaPtySelfCommand.resolve({ command: "koda", cwd: "/tmp/project" }, cmd)).toStrictEqual({
      command: "/tmp/koda",
      args: [],
      cwd: "/tmp/project",
    })
    expect(
      kodaPtySelfCommand.command({
        ...proc,
        argv: ["C:/tmp/koda.exe", "B:/~BUN/root/src/index.js"],
      }).args,
    ).toStrictEqual([])
    expect(
      kodaPtySelfCommand.command({
        ...proc,
        argv: ["C:/tmp/koda.exe", "b:\\~BUN\\root\\src\\index.js"],
      }).args,
    ).toStrictEqual([])
  })

  test("forwards source entrypoints", () => {
    const cmd = kodaPtySelfCommand.command({
      argv: ["/tmp/bun", "/tmp/koda/src/index.ts"],
      execArgv: ["--conditions=browser", "--cwd", "packages/opencode"],
      execPath: "/tmp/bun",
      cwd: "/tmp/koda",
    })
    expect(cmd).toStrictEqual({
      command: "/tmp/bun",
      args: ["--conditions=browser", "/tmp/koda/src/index.ts"],
      cwd: "/tmp/koda",
    })
    expect(kodaPtySelfCommand.resolve({ command: "koda", cwd: "/tmp/project" }, cmd)).toStrictEqual({
      command: "/tmp/bun",
      args: ["--conditions=browser", "/tmp/koda/src/index.ts", "/tmp/project"],
      cwd: "/tmp/koda",
    })
  })
})
