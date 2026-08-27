import { describe, expect, test } from "bun:test"
import { forkTargetDirectory } from "@/koda/server/routes/fork-routing"

function url(path: string) {
  return new URL(path, "http://localhost")
}

describe("forkTargetDirectory", () => {
  test("honors the explicit directory query on a fork request", () => {
    expect(forkTargetDirectory("POST", url("/session/ses_abc/fork?directory=/repo/.koda/worktrees/x"), {})).toBe(
      "/repo/.koda/worktrees/x",
    )
  })

  test("falls back to the x-koda-directory header when no query is present", () => {
    expect(
      forkTargetDirectory("POST", url("/session/ses_abc/fork"), { "x-koda-directory": "/repo/.koda/worktrees/y" }),
    ).toBe("/repo/.koda/worktrees/y")
  })

  test("returns undefined when the fork request carries no target directory", () => {
    expect(forkTargetDirectory("POST", url("/session/ses_abc/fork"), {})).toBeUndefined()
  })

  test("ignores non-fork session routes so they keep using the session's own directory", () => {
    expect(forkTargetDirectory("POST", url("/session/ses_abc/message?directory=/elsewhere"), {})).toBeUndefined()
    expect(forkTargetDirectory("GET", url("/session/ses_abc/fork?directory=/elsewhere"), {})).toBeUndefined()
  })
})
