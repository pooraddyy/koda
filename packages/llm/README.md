# Koda Language-Model Runtime

`@opencode-ai/llm` is the schema-first language-model layer used by Koda. It presents one typed request, response, event, route, and tool vocabulary while keeping provider-specific wire formats inside narrowly scoped adapters.

## Design goals

| Goal | Implementation boundary |
| --- | --- |
| Stable product behavior | Callers work with `LLMRequest`, `LLMResponse`, and `LLMEvent`, not provider response objects. |
| Explicit provider differences | Routes own endpoint, authentication, protocol, framing, and transport decisions. |
| Stream-safe execution | `Stream` carries incremental text, tool, usage, error, and finish events. |
| Testable request construction | `LLMClient.prepare()` compiles a request without sending it. |
| Typed data flow | Effect Schema validates protocol bodies, frames, and public data models. |

## Quick start

Construct a provider facade, select a model, build a portable request, and run it through the client layer supplied by the application runtime.

```ts
import { Effect } from "effect"
import { LLM, LLMClient } from "@opencode-ai/llm"
import { OpenAI } from "@opencode-ai/llm/providers"

const model = OpenAI.configure({ apiKey: process.env.OPENAI_API_KEY }).responses("gpt-4o-mini")

const request = LLM.request({
  model,
  system: "You are concise and precise.",
  prompt: "Summarize the requested change in one sentence.",
  generation: { maxTokens: 80 },
})

const program = Effect.gen(function* () {
  const response = yield* LLMClient.generate(request)
  return response.text
})
```

Use `LLMClient.stream(request)` when the caller needs incremental events, and `LLMClient.generate(request)` when it needs the collected final response. The surrounding Koda session runtime owns conversation history, permissions, tool continuation, cancellation, persistence, and model selection policy.

## Public surface

| API | Responsibility |
| --- | --- |
| `LLM.request(input)` | Normalizes ergonomic input into a canonical `LLMRequest`. |
| `LLMClient.prepare(request)` | Validates and lowers a request without network I/O. |
| `LLMClient.stream(request)` | Produces provider-neutral incremental events. |
| `LLMClient.generate(request)` | Collects one provider turn into an `LLMResponse`. |
| `Message.*` constructors | Create canonical system, user, assistant, and tool messages. |
| `Model.make(...)` | Creates a typed model value with its configured executable route. |
| `ToolDefinition.make(...)` | Declares the model-visible schema for a local tool. |
| `LLMEvent.is.*` | Narrows normalized events such as text deltas, tool calls, errors, and finish events. |

The library executes exactly one provider turn per `stream` or `generate` call. Callers that run tools and continue a conversation must persist the relevant events and build the next request explicitly.

## Route architecture

A route is an executable composition of independent concerns. Keeping these concerns separate makes provider support auditable and prevents a provider quirk from leaking into every call site.

| Route component | Owns |
| --- | --- |
| `Protocol` | Request-body lowering, body schema, stream-event schema, and normalized event state machine. |
| `Endpoint` | Base URL, path construction, query values, and dynamic route paths. |
| `Auth` | Per-request credentials, headers, and signing behavior. |
| `Framing` | Byte-to-frame decoding for SSE and other wire formats. |
| `Transport` | The I/O implementation for HTTP or supported non-HTTP protocols. |

```ts
export const route = Route.make({
  id: "openai-chat",
  provider: "openai",
  protocol: OpenAIChat.protocol,
  endpoint: Endpoint.path("/chat/completions", { baseURL: "https://api.openai.com/v1" }),
  auth: Auth.bearer(),
  framing: Framing.sse,
})
```

Provider facades configure route-level settings before selecting a model. Keep provider-specific options in `.configure(...)`, use the stable `generation` fields for portable behavior, and reserve raw HTTP overlays for a reviewed compatibility gap.

## Caching and tools

Requests use an `auto` cache policy unless a caller opts out. Automatic placement focuses on stable tool definitions, system context, and the newest user boundary so repeated tool-loop turns can reuse an appropriate provider prefix. Providers that do not support an equivalent wire-level cache marker receive the normalized request without an invented caching behavior.

```ts
const request = LLM.request({
  model,
  prompt: "A one-off question",
  cache: "none",
})
```

Tool calls are represented as common message and event types. Validate local tool input with a schema, return typed success or `ToolFailure` values, and let the Koda session layer decide whether the next model turn is authorized. Hosted provider tools remain provider-executed and must never be dispatched as local tools.

## Contributor workflow

Use current project patterns and Effect v4 APIs. Protocol tests should be fixture-first; live recordings require an explicit recording mode and their own credential checks. Verify the narrowest affected route before running a broad provider suite.

```bash
cd packages/llm
bun test
```

Read [`AGENTS.md`](AGENTS.md) for package conventions and `example/tutorial.ts` for a runnable end-to-end shape.
