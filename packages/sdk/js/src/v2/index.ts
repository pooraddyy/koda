export * from "./client.js"
export * from "./server.js"

import { createkodaClient } from "./client.js"
import { createkodaServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createkoda(options?: ServerOptions) {
  const server = await createkodaServer({
    ...options,
  })

  const client = createkodaClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
