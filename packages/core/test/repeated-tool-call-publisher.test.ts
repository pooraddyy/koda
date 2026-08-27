import { LLMEvent } from "@opencode-ai/llm"
import { Effect } from "effect"
import { describe, expect, test } from "bun:test"
import { EventV2 } from "../src/event"
import { ModelV2 } from "../src/model"
import { ProviderV2 } from "../src/provider"
import { SessionEvent } from "../src/session/event"
import { SessionSchema } from "../src/session/schema"
import { createLLMEventPublisher } from "../src/session/runner/publish-llm-event"

const sessionID = SessionSchema.ID.make("ses_repeated_tool_publisher")
const model = {
  id: ModelV2.ID.make("model"),
  providerID: ProviderV2.ID.make("provider"),
}

const makeEvents = () => {
  const published: Array<{ type: string; data: unknown }> = []
  const events = {
    publish: (definition: { readonly type: string }, data: unknown) => {
      published.push({ type: definition.type, data })
      return Effect.succeed(undefined as never)
    },
  } as unknown as EventV2.Interface
  return { events, published }
}

describe("repeated tool-call publisher protection", () => {
  test("persists one blocked tool failure and does not overwrite it during cleanup", async () => {
    const { events, published } = makeEvents()
    const publisher = createLLMEventPublisher(events, { sessionID, agent: "build", model })
    const call = LLMEvent.toolCall({ id: "call_1", name: "read", input: { path: "a.ts" } })

    await Effect.runPromise(publisher.publish(call))
    await Effect.runPromise(publisher.failTool(call.id, "The same tool call was requested 4 times consecutively."))
    await Effect.runPromise(publisher.failAssistant("The repeated call was stopped."))
    await Effect.runPromise(publisher.failUnsettledTools("Provider did not return a tool result", true))

    const called = published.filter((event) => event.type === SessionEvent.Tool.Called.type)
    const failedTools = published.filter((event) => event.type === SessionEvent.Tool.Failed.type)
    const failedSteps = published.filter((event) => event.type === SessionEvent.Step.Failed.type)

    expect(called).toHaveLength(1)
    expect(failedTools).toHaveLength(1)
    expect(failedSteps).toHaveLength(1)
    expect((failedTools[0]?.data as { callID: string }).callID).toBe(call.id)
  })
})
