import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  koda_SERVER_PASSWORD: Flag.koda_SERVER_PASSWORD,
  koda_SERVER_USERNAME: Flag.koda_SERVER_USERNAME,
}

afterEach(() => {
  Flag.koda_SERVER_PASSWORD = original.koda_SERVER_PASSWORD
  Flag.koda_SERVER_USERNAME = original.koda_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.koda_SERVER_PASSWORD = undefined
    Flag.koda_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the koda username", () => {
    // koda_change
    Flag.koda_SERVER_PASSWORD = "secret"
    Flag.koda_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("koda:secret").toString("base64")}`, // koda_change
    })
  })

  test("uses the configured username", () => {
    Flag.koda_SERVER_PASSWORD = "secret"
    Flag.koda_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.koda_SERVER_PASSWORD = "secret"
    Flag.koda_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "koda", password: Redacted.make("secret") }, config)).toBe(false) // koda_change
  })
})
