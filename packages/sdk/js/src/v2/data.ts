import type { Part, UserMessage } from "./client.js"

const idChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

let lastTimestamp = 0
let counter = 0

// Mirrors @koda-ai/core's Identifier scheme: `<prefix>_` + 12 hex chars of
// (timestamp * 0x1000 + per-ms counter) + 14 random base62 chars. Every message and part
// gets a unique, well-formed ID instead of a hardcoded placeholder.
const createIdentifier = () => {
  const timestamp = Date.now()
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp
    counter = 0
  }
  counter++

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter)
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((current >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("")
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return time + Array.from(bytes, (byte) => idChars[byte % 62]).join("")
}

const messageID = () => `msg_${createIdentifier()}`
const partID = () => `prt_${createIdentifier()}`

export const message = {
  user(input: Omit<UserMessage, "role" | "time" | "id"> & { parts: Omit<Part, "id" | "sessionID" | "messageID">[] }): {
    info: UserMessage
    parts: Part[]
  } {
    const { parts: _parts, ...rest } = input

    const id = messageID()
    const info: UserMessage = {
      ...rest,
      id,
      time: {
        created: Date.now(),
      },
      role: "user",
    }

    return {
      info,
      parts: input.parts.map(
        (part) =>
          ({
            ...part,
            id: partID(),
            messageID: id,
            sessionID: info.sessionID,
          }) as Part,
      ),
    }
  },
}
