export * from "./client.js"
export * from "./server.js"

import { createKodaClient } from "./client.js"
import { createKodaServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createKoda(options?: ServerOptions) {
  const server = await createKodaServer({
    ...options,
  })

  const client = createKodaClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
