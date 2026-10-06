import { getTelegramService, type LLMConfig } from "@/telegram/service"
import { Config } from "@/config/config"
import { Auth } from "@/auth"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

type TelegramSvc = ReturnType<typeof getTelegramService>

/**
 * Wire TelegramService callbacks.
 * Uses direct LLM calls (plain fetch) with the same model/provider as TUI.
 * No Effect context needed in callbacks — config is captured at connect time.
 */
function wireBotCallbacks(svc: TelegramSvc, onSetup: (setup: import("@/telegram/service").ProviderSetup) => Promise<void>) {
  // Direct chat: LLM response via direct API call
  svc.onChat(async (text, chatId): Promise<string> => {
    try {
      return await svc.chatWithLLM(text, chatId)
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : "unknown error"}`
    }
  })

  // Research requests from /research command
  svc.onResearch(async (topic, chatId, task) => {
    try {
      const response = await svc.chatWithLLM(
        `Deep research request: ${topic}\n\nProvide a comprehensive research report on this topic.`,
        chatId,
      )
      await svc.sendMessage(chatId, `Research complete for "${topic}":\n\n${response}`)
      svc.updateTaskProgress(task.id)
    } catch (err) {
      await svc
        .sendMessage(chatId, `Research error: ${err instanceof Error ? err.message : "unknown"}`)
        .catch(() => {})
    }
  })

  // Provider setup from /setup wizard in Telegram
  svc.onProviderSetup(async (setup) => {
    await onSetup(setup)
  })
}

/**
 * Build LLM config from global config + auth.
 * Returns null if no model/provider is configured.
 */
const buildLLMConfig = Effect.fn("TelegramHttpApi.buildLLMConfig")(function* () {
  const configSvc = yield* Config.Service
  const authSvc = yield* Auth.Service
  const global = yield* configSvc.getGlobal()

  const providers = (global as any).provider as Record<string, any> | undefined
  if (!providers) return null

  let providerId: string | undefined
  let modelId: string | undefined

  // 1. Try the globally selected model first
  const modelStr = (global as any).model as string | undefined
  if (modelStr) {
    const slashIdx = modelStr.indexOf("/")
    if (slashIdx > 0) {
      providerId = modelStr.slice(0, slashIdx)
      modelId = modelStr.slice(slashIdx + 1)
    }
  }

  // 2. Auto-detect: use first provider with a model if no model selected
  if (!providerId || !modelId || !providers[providerId]) {
    for (const [pid, pcfg] of Object.entries(providers)) {
      const models = (pcfg as any)?.models as Record<string, any> | undefined
      const firstModel = models ? Object.keys(models)[0] : undefined
      if (firstModel && (pcfg as any)?.options?.baseURL) {
        providerId = pid
        modelId = firstModel
        break
      }
    }
  }

  if (!providerId || !modelId) return null
  const providerCfg = providers[providerId]
  if (!providerCfg) return null

  // Get baseURL from provider options
  const baseURL = providerCfg.options?.baseURL as string | undefined
  if (!baseURL) return null

  // Get API key from auth storage
  const authInfo = yield* authSvc.get(providerId).pipe(Effect.orElseSucceed(() => undefined))
  const apiKey = (authInfo as any)?.key as string | undefined
  if (!apiKey) return null

  const cfg: LLMConfig = { providerId, modelId, baseURL, apiKey }
  return cfg
})

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const configSvc = yield* Config.Service
    const authSvc = yield* Auth.Service

    /**
     * Save provider setup from Telegram /setup wizard to global config + auth.
     * Returns a Promise for use in plain async callbacks.
     */
    const saveProviderSetup = (setup: import("@/telegram/service").ProviderSetup): Promise<void> =>
      Effect.runPromise(
        Effect.gen(function* () {
          // Save auth key
          yield* authSvc.set(setup.providerId, { type: "api", key: setup.apiKey } as any)
          // Save provider config
          yield* configSvc.updateGlobal({
            provider: {
              [setup.providerId]: {
                name: setup.displayName,
                npm: "@ai-sdk/openai-compatible",
                options: { baseURL: setup.baseURL },
                models: { [setup.modelId]: { name: setup.modelName } },
              },
            },
            // Set as the active model
            model: `${setup.providerId}/${setup.modelId}`,
          } as any)
        }),
      )

    /**
     * Try to auto-reconnect using saved credentials from global config.
     * Called lazily when the service is not connected.
     */
    const ensureConnected = (): Effect.Effect<void, never, any> =>
      Effect.gen(function* () {
        const svc = getTelegramService()
        if (svc.isConnected()) return
        const global = yield* configSvc.getGlobal()
        const tg = (global as any).telegram as { token?: string; adminId?: string } | undefined
        if (tg?.token && tg?.adminId) {
          const svc2 = getTelegramService()
          yield* Effect.tryPromise({
            try: () => svc2.connect(tg.token!, tg.adminId!),
            catch: (err) => (err instanceof Error ? err : new Error("auto-reconnect failed")),
          }).pipe(
            Effect.tap(() =>
              Effect.gen(function* () {
                wireBotCallbacks(svc2, saveProviderSetup)
                // Capture LLM config for bot replies
                const llmCfg = yield* buildLLMConfig().pipe(Effect.orElseSucceed(() => null))
                svc2.setLLMConfig(llmCfg)
              }),
            ),
            Effect.ignore, // Don't fail if auto-reconnect fails (e.g. revoked token)
          )
        }
      })

    const connect = Effect.fn("TelegramHttpApi.connect")(function* (ctx: {
      payload: { token: string; adminId: string }
    }) {
      const result = yield* Effect.tryPromise({
        try: () => {
          const svc = getTelegramService()
          return svc.connect(ctx.payload.token, ctx.payload.adminId)
        },
        catch: (err) => (err instanceof Error ? err : new Error("Telegram connection failed")),
      }).pipe(
        Effect.tap(() =>
          Effect.gen(function* () {
            const svc = getTelegramService()
            wireBotCallbacks(svc, saveProviderSetup)
            // Capture LLM config for bot replies (same model as TUI)
            const llmCfg = yield* buildLLMConfig().pipe(Effect.orElseSucceed(() => null))
            svc.setLLMConfig(llmCfg)
            // Persist credentials to global config for auto-reconnect across restarts
            yield* configSvc.updateGlobal({
              telegram: { token: ctx.payload.token, adminId: ctx.payload.adminId },
            } as any)
          }),
        ),
        Effect.map((r) => ({
          username: r.username as string | undefined,
          connected: true,
          error: undefined as string | undefined,
        })),
        Effect.catch((err: Error) =>
          Effect.succeed({
            username: undefined as string | undefined,
            connected: false,
            error: err.message,
          }),
        ),
      )
      return result
    })

    const disconnect = Effect.fn("TelegramHttpApi.disconnect")(function* () {
      const svc = getTelegramService()
      svc.disconnect()
      svc.clearChatSessions()
      svc.setLLMConfig(null)
      // Clear persisted credentials
      yield* configSvc.updateGlobal({ telegram: undefined } as any).pipe(Effect.ignore)
      return { disconnected: true }
    })

    const status = Effect.fn("TelegramHttpApi.status")(function* () {
      yield* ensureConnected()
      const svc = getTelegramService()
      return {
        connected: svc.isConnected(),
        runningTasks: svc.getRunningTasks().length,
      }
    })

    return handlers.handle("connect", connect).handle("disconnect", disconnect).handle("status", status)
  }),
)
