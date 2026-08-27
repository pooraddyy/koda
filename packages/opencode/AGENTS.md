# Koda CLI Package Guide

This package owns the terminal command surface, local services, sessions, providers, configuration loading, and the runtime that feeds Koda's terminal UI. Changes here should keep the CLI predictable, permission-aware, and easy to verify from a local checkout.

## Development commands

Run commands from `packages/opencode` unless a command says otherwise.

| Goal | Command |
| --- | --- |
| Inspect source CLI behavior | `bun run --conditions=node ./src/index.ts --help` |
| Run the package test runner | `bun test` |
| Run one focused test | `bun test test/koda/<file>.test.ts` |
| Type-check the package | `bun run typecheck` |
| Build release artifacts | `bun run build` |

Use the `node` condition when invoking the terminal entry point directly. The root repository command `bun run dev` already uses that condition for the source CLI.

## Module conventions

Koda follows TypeScript namespace modules for cohesive runtime domains. A namespace exposes schemas, inferred types, and validated functions together rather than relying on mutable classes.

```ts
export namespace Session {
  export const Info = z.object({ id: z.string() })
  export type Info = z.infer<typeof Info>

  export const create = fn(z.object({ directory: z.string() }), async (input) => {
    // implementation
  })
}
```

| Pattern | Intent |
| --- | --- |
| `fn(schema, callback)` | Validate public inputs at the boundary. |
| `Instance.state(init, dispose?)` | Maintain a lazy, project-directory-scoped singleton. |
| `Tool.define(id, init)` | Define a tool with description, parameters, and bounded execution. |
| `BusEvent.define(type, schema)` and `Bus.publish()` | Publish validated in-process lifecycle events. |
| `NamedError.create(name, schema)` | Return structured, serializable failures instead of untyped throws. |
| `Log.create({ service })` | Attach a stable service name to diagnostic output. |

Prefer narrow changes that keep ownership, error handling, event lifecycles, and test setup obvious. State held outside `Instance.state` is shared by the surrounding service instance, so choose it deliberately and document why project scoping is not required.

## Process and filesystem safety

Use the project's process helper for commands that may run on Windows. It applies the correct window-hiding behavior and gives process lifecycle handling a single place to evolve. Do not build shell strings from untrusted project data; pass commands and arguments through the process API's structured form.

Storage is file-backed JSON under Koda's data path. Use semantic path segments such as `Storage.write(["session", projectID, sessionID], value)`, validate untrusted data at read boundaries, and avoid treating persistence as a substitute for authorization or current session state.

## Terminal UI and local server contracts

The terminal UI uses SolidJS and OpenTUI. JSX renders terminal primitives such as `<box>`, `<text>`, and `<scrollbox>`; it does not render a browser application. Keep UI-facing events stable, avoid leaking provider credentials into visible output, and test keyboard flows with focused terminal tests.

Koda's local service uses Hono, OpenAPI generation, and server-sent events. When changing an endpoint, verify authentication, directory scoping, response schema, and event behavior. Use the procedures in [`../../TESTING.md`](../../TESTING.md) for local HTTP checks and regenerate derived API artifacts only when the changed contract requires them.

## Providers, permissions, and agent behavior

Provider integrations are mediated through the Vercel AI SDK and Koda's provider registry. Treat model metadata, custom endpoints, and environment-derived credentials as untrusted inputs until normalized. A provider feature is complete only when it has a clear configuration path, an actionable error state, and scoped verification.

Permission checks, cancellation, budgets, and lifecycle events are core runtime behavior. Do not weaken a permission boundary to satisfy a convenience path. A change that affects tools, sessions, collaboration, retained lessons, or hooks should preserve explicit operator control and have a focused regression test.
