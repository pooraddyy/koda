import type { Hooks } from "@koda/plugin"
import * as Log from "@opencode-ai/core/util/log" // koda_change
import { ModalModels } from "./models"

const log = Log.create({ service: "plugin.modal" }) // koda_change

export async function ModalPlugin(): Promise<Hooks> {
  return {
    provider: {
      id: "modal",
      async models(provider, ctx) {
        const apiKey = ctx.auth?.type === "api" ? ctx.auth.key : process.env.MODAL_PROXY_TOKEN
        const baseURL = Object.values(provider.models)[0]?.api.url
        if (!apiKey || !baseURL) return provider.models // koda_change - preserve catalog models without discovery credentials

        // koda_change start - transient discovery failures must not erase the existing catalog
        return ModalModels.get(baseURL, apiKey, provider.models).catch((err) => {
          log.warn("modal model discovery failed", { err })
          return provider.models
        })
        // koda_change end
      },
    },
  }
}
