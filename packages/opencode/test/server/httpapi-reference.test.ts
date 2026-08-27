import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Server } from "../../src/server/server"
import { Global } from "@opencode-ai/core/global"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { Effect } from "effect"
import { pollWithTimeout } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("reference HttpApi", () => {
  test("lists usable references resolved in the server workspace", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false,
        references: {
          docs: "./docs",
          effect: { repository: "Effect-TS/effect", branch: "main" },
          bad: "not-a-repo",
        },
      },
    })

    const body = await Effect.runPromise(
      pollWithTimeout(
        Effect.promise(async () => {
          const response = await Server.Default().app.request("/api/reference", {
            headers: { "x-koda-directory": tmp.path },
          })
          expect(response.status).toBe(200)
          const body = await response.json()
          return body.data.length === 0 ? undefined : body
        }),
        "references were not loaded",
      ),
    )
    expect(body).toMatchObject({ location: { directory: tmp.path } })
    expect(body.data).toEqual([
      {
        name: "docs",
        path: path.join(tmp.path, "docs"),
        source: {
          type: "local",
          path: path.join(tmp.path, "docs"),
        },
      },
      {
        name: "effect",
        path: path.join(Global.Path.repos, "github.com", "Effect-TS", "effect@main"),
        source: {
          type: "git",
          repository: "Effect-TS/effect",
          branch: "main",
        },
      },
    ])
  })

  // koda_change start - reference reads must reconcile config changes after instance disposal.
  test("refreshes references after project config updates", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false,
        references: { docs: "./docs" },
      },
    })
    const headers = { "content-type": "application/json", "x-koda-directory": tmp.path }

    const initial = await Server.Default().app.request("/api/reference", { headers })
    expect(initial.status).toBe(200)
    expect((await initial.json()).data[0].path).toBe(path.join(tmp.path, "docs"))

    const updated = await Server.Default().app.request("/config", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        formatter: false,
        lsp: false,
        references: { docs: { path: "./updated", description: "Updated documentation" } },
      }),
    })
    expect(updated.status).toBe(200)

    const refreshed = await Server.Default().app.request("/api/reference", { headers })
    expect(refreshed.status).toBe(200)
    expect((await refreshed.json()).data[0]).toMatchObject({
      name: "docs",
      path: path.join(tmp.path, "updated"),
      description: "Updated documentation",
    })
  })
  // koda_change end

  // koda_change start - direct clients must observe effective koda config before Agent initialization.
  test("lists koda_CONFIG_CONTENT references with metadata on the first request", async () => {
    const previous = process.env.koda_CONFIG_CONTENT
    process.env.koda_CONFIG_CONTENT = JSON.stringify({
      references: {
        private: {
          path: "./private-docs",
          description: "Private documentation",
          hidden: true,
        },
      },
    })

    try {
      await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
      const response = await Server.Default().app.request("/api/reference", {
        headers: { "x-koda-directory": tmp.path },
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data).toEqual([
        {
          name: "private",
          path: path.join(tmp.path, "private-docs"),
          description: "Private documentation",
          hidden: true,
          source: {
            type: "local",
            path: path.join(tmp.path, "private-docs"),
            description: "Private documentation",
            hidden: true,
          },
        },
      ])
    } finally {
      if (previous === undefined) delete process.env.koda_CONFIG_CONTENT
      else process.env.koda_CONFIG_CONTENT = previous
    }
  })
  // koda_change end
})
