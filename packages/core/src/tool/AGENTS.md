# Core Tool Architecture Guide

This directory owns Koda Core's canonical local-tool representation, registration, lookup, invocation settlement, and generic model-output bounding. A tool should have one executable representation and one clear authority boundary.

## Core model

| Component | Responsibility |
| --- | --- |
| `tool.ts` | Defines the opaque canonical `Tool.make({ description, input, output, execute, toModelOutput })` value. |
| `application-tools.ts` | Stores process-scoped application registrations. |
| `tools.ts` | Exposes the registration-focused `Tools.Service` view used by location producers. |
| `registry.ts` | Resolves effective registrations, derives definitions, invokes tools, and applies generic output limits. |

Do not introduce a parallel executable tool type, registry-owned authorization callback, output-path callback, or legacy normalization pipeline. Application-provided and built-in tools should meet at the same canonical type.

## Construction and execution

Use `input` and `output` for schemas and projection. A `Tool` value remains opaque: consumers should not reach into its codecs, executor, definition derivation, or permission catalog details.

Location-scoped layers resolve their required services when the layer is built, then capture those services in the executor. Build permission sources from the canonical invocation context.

```ts
const source = {
  type: "tool" as const,
  messageID: context.assistantMessageID,
  callID: context.toolCallID,
}
```

Leaf tools own argument resolution, permission decisions, and side-effect ordering. Convert only expected typed operational errors into `ToolFailure`; interruption and defects must remain visible rather than being hidden by broad cause handling.

## Registration precedence

Register built-ins through `Tools.Service.register({ [name]: tool })` and application tools through `ApplicationTools.Service.register(...)`. Registration is scoped and reversible.

1. The latest active registration at the same placement wins.
2. Closing a registration reveals the next active registration without removing unrelated tools.
3. Location registrations take precedence over application registrations.
4. An invocation captures the effective tool at settlement start.

`ApplicationTools.Service` is process-scoped across locations; `ToolRegistry.Service` is location-scoped. Do not promote the registry to global state or recreate the application tool service for each location.

## Permission and output boundaries

Catalog filtering determines whether a tool definition is visible to the model. It is not execution authorization. Execution authorization belongs to the captured tool leaf policy and must still run for every invocation that reaches settlement.

Built-ins return complete validated domain output. `ToolRegistry.Materialization.settle` is the sole generic execution and model-output-bounding boundary. Producer capture limits remain local to their tools: a shell tool, for example, can accurately record stdout/stderr truncation without independently performing model-output truncation or inventing managed output paths.

## Review checklist

Before accepting a tool change, verify that the tool has one canonical type, precise schemas, a declared permission action, stable cancellation behavior, bounded output, and a focused test for its user-visible failure mode. Keep plugin and future external-tool registration work isolated until their canonical registration design is explicit.
