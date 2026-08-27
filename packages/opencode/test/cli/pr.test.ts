// koda_change - new file
import { expect, test } from "bun:test"
import { cliCommand } from "../../src/cli/cmd/pr"

test("cliCommand uses the current script when argv[1] is a file path", () => {
  const result = cliCommand({
    execPath: "/usr/bin/node",
    argv: ["/usr/bin/node", "/tmp/koda.js", "pr", "1"],
    exists: (file) => file === "/tmp/koda.js",
  })

  expect(result).toEqual(["/usr/bin/node", "/tmp/koda.js"])
})

test("cliCommand falls back to execPath when argv[1] is a subcommand", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/koda",
    argv: ["/usr/local/bin/koda", "pr", "1"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/koda"])
})

test("cliCommand ignores subcommand token even when it exists on disk", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/koda",
    argv: ["/usr/local/bin/koda", "pr", "1"],
    exists: (file) => file === "pr",
  })

  expect(result).toEqual(["/usr/local/bin/koda"])
})

test("cliCommand falls back to execPath when argv[1] is missing", () => {
  const result = cliCommand({
    execPath: "/usr/local/bin/koda",
    argv: ["/usr/local/bin/koda"],
    exists: () => false,
  })

  expect(result).toEqual(["/usr/local/bin/koda"])
})

test("cliCommand falls back to execPath for bun virtual script paths", () => {
  const unix = cliCommand({
    execPath: "/tmp/koda",
    argv: ["/tmp/koda", "/$bunfs/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  const win = cliCommand({
    execPath: "C:/tmp/koda.exe",
    argv: ["C:/tmp/koda.exe", "B:/~BUN/root/src/index.js", "pr", "1"],
    exists: () => true,
  })

  expect(unix).toEqual(["/tmp/koda"])
  expect(win).toEqual(["C:/tmp/koda.exe"])
})
