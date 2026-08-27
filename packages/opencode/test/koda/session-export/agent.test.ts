import { expect, test } from "bun:test"
import { SessionExport } from "@/koda/session-export"

test("agent info export omits prompt options and permissions", () => {
  const info = SessionExport.agentInfo({
    name: "code",
    displayName: "Code",
    description: "writes code",
    mode: "primary",
    native: true,
    prompt: "custom proprietary prompt",
    options: { apiKey: "secret" },
    permission: { bash: "allow" },
    model: { providerID: "koda", modelID: "free" },
    variant: "fast",
  } as never)

  expect(info).toEqual({
    name: "code",
    displayName: "Code",
    description: "writes code",
    mode: "primary",
    native: true,
    model: { providerID: "koda", modelID: "free" },
    variant: "fast",
  })
})
