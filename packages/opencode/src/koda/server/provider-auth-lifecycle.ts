import { InstanceStore } from "@/project/instance-store"
import { ModelCache } from "@/provider/model-cache"
import { kodaViewers } from "@/koda/presence/service" // koda_change
import { Effect } from "effect"

export const disposeAllInstancesAfterProviderAuthCallback = Effect.fn(
  "kodaServer.disposeAllInstancesAfterProviderAuthCallback",
)(function* () {
  const store = yield* InstanceStore.Service
  yield* store.disposeAll()
})

// koda_change start - drop the old presence socket; callers invoke this for the "koda" provider only
export const invalidatePresence = Effect.fn("kodaServer.invalidatePresence")(function* () {
  const viewers = yield* kodaViewers.Service
  yield* viewers.invalidateAuth()
})
// koda_change end

export const invalidateAfterProviderAuthChange = Effect.fn("kodaServer.invalidateAfterProviderAuthChange")(function* (
  providerID: string,
) {
  const cache = yield* ModelCache.Service
  yield* cache.clear(providerID)
  yield* disposeAllInstancesAfterProviderAuthCallback()
})
