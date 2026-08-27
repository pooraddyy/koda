# Koda HTTP API Route Guide

The HTTP API supports the terminal CLI, local sessions, controlled remote access, and test tooling. Route changes must preserve typed contracts, directory isolation, authentication expectations, and observable error behavior.

## Route construction

Use `HttpApiBuilder.group(...)` for declared endpoints, including server-sent event responses. Resolve stable services while constructing the handler layer, then close over them in individual endpoint handlers.

```ts
export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    return handlers.handle("list", () => session.list())
  }),
)
```

| Need | Preferred pattern |
| --- | --- |
| Typed JSON endpoint | `HttpApiBuilder.group(...).handle(...)` |
| Declared SSE endpoint | `handle(...)` with `HttpServerResponse.stream(...)` and a text-event-stream schema |
| Declared raw transport route | `handleRaw(...)` while retaining the owning API group's middleware and metadata |
| Undeclared global fallback | `HttpRouter.use(...)` only when it cannot belong to the typed API surface |

## Dependency boundaries

Provide stable layers at application assembly time rather than recreating them inside a request handler. Use request-scoped service provision only for information derived from the incoming request, such as a workspace or instance reference. Domain services, persistence, and authorization policy must remain independent of HTTP transport types.

Avoid `Effect.provide(...)` inside a normal request handler unless the dependency is intentionally request-local and cannot be supplied at the application boundary. Hidden per-request layer construction makes resource lifetime and test behavior difficult to reason about.

## Errors, streaming, and verification

Declare public errors as explicit schema contracts on the endpoint. Use a built-in HTTP API error only when its exact tagged shape is the intended wire response; otherwise define and return a route-specific error schema. Translate expected domain failures at the route boundary without leaking internal stack traces, paths, credentials, or provider data.

For SSE, verify connection cancellation, event ordering, terminal events, and response content type. For every route change, exercise authentication and directory-scoping behavior as applicable, then run the narrowest relevant test. The repository-level terminal procedure is documented in [`../../../../../../TESTING.md`](../../../../../../TESTING.md).
