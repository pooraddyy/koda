import { getTelegramService } from "@/telegram/service"
import { Config } from "@/config/config"
import { SessionPrompt } from "@/session/prompt"
import { SessionShare } from "@/share/session"
import { Effect, Context } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

type TelegramSvc = ReturnType<typeof getTelegramService>

/**
 * Wire TelegramService callbacks to the agent system.
 * Captures the handler's full Effect context so callbacks (plain async functions)
 * can run Effects with all required services (SessionPrompt, SessionShare, etc.).
 * Uses the same model/provider config as the TUI (from global config).
 */
function wireBotCallbacks(svc: TelegramSvc, ctx: Context.Context<any>) {
  const run = <A, E>(effect: Effect.Effect<A, E, any>): Promise<A> =>
    Effect.runPromise(Effect.provide(effect, ctx) as Effect.Effect<A, E, never>)

  const extractText = (result: unknown): string => {
    const texts: string[] = []
    for (const part of ((result as any)?.parts ?? [])) {
      if (part?.type === "text" && part.text) texts.push(part.text)
    }
    return texts.join("\n").trim() || "(no response)"
  }

  const getOrCreateSession = (chatId: number) =>
    Effect.gen(function* () {
      const shareSvc = yield* SessionShare.Service
      let sessionID = svc.getChatSession(chatId)
      if (!sessionID) {
        const session = yield* shareSvc.create({ title: `Telegram chat ${chatId}` })
        sessionID = session.id
        svc.setChatSession(chatId, sessionID)
      }
      return sessionID
    })

  // Direct chat: run the agent and return its response
  svc.onChat(async (text, chatId): Promise<string> => {
    try {
      const result: string = await run(
        Effect.gen(function* () {
          const promptSvc = yield* SessionPrompt.Service
          const sessionID = yield* getOrCreateSession(chatId)
          // Prompt the agent (uses the configured model, same as TUI)
          const response = yield* promptSvc.prompt({
            sessionID: sessionID as any,
            parts: [{ type: "text", text } as any],
          })
          return extractText(response)
        }) as Effect.Effect<string, unknown, never>,
      )
      return result
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : "unknown error"}`
    }
  })

  // Research requests from /research command
  svc.onResearch(async (topic, chatId, task) => {
    await run(
      Effect.gen(function* () {
        const promptSvc = yield* SessionPrompt.Service
        const sessionID = yield* getOrCreateSession(chatId)
        const response = yield* promptSvc.prompt({
          sessionID: sessionID as any,
          parts: [
            {
              type: "text",
              text: `Deep research request: ${topic}\n\nProvide a comprehensive research report on this topic.`,
            } as any,
          ],
        })
        const text = extractText(response)
        yield* Effect.tryPromise({
          try: () => svc.sendMessage(chatId, `Research complete for "${topic}":\n\n${text}`),
          catch: () => new Error("send failed"),
        }).pipe(Effect.ignore)
        svc.updateTaskProgress(task.id)
      }).pipe(Effect.ignore),
    )
  })
}

export const telegramHandlers = HttpApiBuilder.group(InstanceHttpApi, "telegram", (handlers) =>
  Effect.gen(function* () {
    const configSvc = yield* Config.Service
    // Capture the full Effect context for bot callbacks (plain async functions)
    const effectCtx = yield* Effect.context<any>()

    /**
     * Try to auto-reconnect using saved credentials from global config.
     * Called lazily when the service is not connected.
     */
    const ensureConnected = (): Effect.Effect<void> =>
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
            Effect.tap(() => Effect.sync(() => wireBotCallbacks(svc2, effectCtx))),
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
            wireBotCallbacks(svc, effectCtx)
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
