import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

const Package = Schema.Struct({ version: Schema.String })

// GitHub's latest Koda release can be a non-CLI artifact, so select CLI versions from npm.
// Use the public npm channel so curl installs resolve only koda CLI versions.
export function latest(http: HttpClient.HttpClient, path: string, channel: string) {
  return Effect.gen(function* () {
    const response = yield* http.execute(
      HttpClientRequest.get(`https://registry.npmjs.org/${path}/${channel}`).pipe(HttpClientRequest.acceptJson),
    )
    const data = yield* HttpClientResponse.schemaBodyJson(Package)(response)
    return data.version
  })
}
