import { createStore, reconcile, unwrap } from "solid-js/store" // koda_change
import { createSimpleContext } from "./helper"
import type { PromptInfo } from "../prompt/history"
import { useTuiStartup } from "./runtime"

export type HomeRoute = {
  type: "home"
  prompt?: PromptInfo
}

export type SessionRoute = {
  type: "session"
  sessionID: string
  prompt?: PromptInfo
}

// koda_change start
export type kodaClawRoute = {
  type: "kodaclaw"
}
// koda_change end

export type PluginRoute = {
  type: "plugin"
  id: string
  data?: Record<string, unknown>
}

export type Route = HomeRoute | SessionRoute | PluginRoute | kodaClawRoute // koda_change

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: (props: { initialRoute?: Route }) => {
    const startup = useTuiStartup()
    const [store, setStore] = createStore<Route>(
      props.initialRoute ?? initialRoute(startup.initialRoute) ?? { type: "home" },
    )

    // koda_change start
    let previous: Route | undefined
    // koda_change end

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        previous = structuredClone(unwrap(store)) // koda_change
        setStore(reconcile(route))
      },
      // koda_change start
      back() {
        const target = previous ?? ({ type: "home" } as const)
        previous = undefined
        console.log("navigate", target)
        setStore(target)
      },
      // koda_change end
    }
  },
})

function initialRoute(value: unknown): Route | undefined {
  if (!value || typeof value !== "object" || !("type" in value)) return
  if (value.type === "home") return { type: "home" }
  if (value.type === "session" && "sessionID" in value && typeof value.sessionID === "string") {
    return { type: "session", sessionID: value.sessionID }
  }
  if (value.type === "plugin" && "id" in value && typeof value.id === "string") {
    return { type: "plugin", id: value.id }
  }
}

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: typeof type }>
}
