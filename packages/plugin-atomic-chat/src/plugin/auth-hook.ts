import type { Hooks } from "@koda/plugin"
import { ATOMIC_CHAT_PROVIDER_KEY } from "../constants"

export function createAuthHook(): NonNullable<Hooks["auth"]> {
  return {
    provider: ATOMIC_CHAT_PROVIDER_KEY,
    methods: [
      {
        type: "api",
        label: "Local server",
      },
    ],
  }
}
