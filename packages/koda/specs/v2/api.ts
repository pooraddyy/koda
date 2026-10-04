// @ts-nocheck

import { Koda } from "@koda-ai/core"
import { ReadTool } from "@koda-ai/core/tools"

const koda = Koda.make({})

koda.tool.add(ReadTool)

koda.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

koda.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

koda.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await koda.session.create({
  agent: "build",
})

koda.subscribe((event) => {
  console.log(event)
})

await koda.session.prompt({
  sessionID,
  text: "hey what is up",
})

await koda.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await koda.session.wait()

console.log(await koda.session.messages(sessionID))
