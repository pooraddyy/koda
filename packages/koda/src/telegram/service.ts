import { TelegramBot } from "./bot"
import type { TelegramMessage } from "./bot"
import { Config } from "@/config/config"
import { Effect } from "effect"

export interface TelegramConfig {
  token: string
  adminId: string
}

export interface ResearchTask {
  id: string
  topic: string
  chatId: number
  updateIntervalMinutes: number
  maxDurationHours: number | null // null = continuous until stopped
  startedAt: number
  lastUpdateAt: number
  status: "running" | "stopped" | "completed"
}

export interface LLMConfig {
  providerId: string
  modelId: string
  baseURL: string
  apiKey: string
}

export interface ProviderSetup {
  providerId: string
  displayName: string
  baseURL: string
  apiKey: string
  modelId: string
  modelName: string
}

interface SetupWizardState {
  step: "providerId" | "baseURL" | "apiKey" | "modelId"
  providerId: string
  baseURL: string
  apiKey: string
}

/** Conversation state for the inline UX flow */
type ChatFlow =
  | { kind: "idle" }
  | { kind: "awaiting_topic" }
  | { kind: "awaiting_duration"; topic: string }

interface ContinuousResearch {
  topic: string
  chatId: number
  startedAt: number
  endsAt: number | null // null = until stopped
  intervalMs: number
  timer: ReturnType<typeof setTimeout> | null
  previousFindings: string[]
  updateCount: number
}

/**
 * Telegram integration service.
 * Manages bot connection, command handling, and research task updates.
 */
export class TelegramService {
  private bot: TelegramBot | null = null
  private config: TelegramConfig | null = null
  private llmConfig: LLMConfig | null = null
  private researchTasks = new Map<string, ResearchTask>()
  private onResearchRequest: ((topic: string, chatId: number, task: ResearchTask) => Promise<void>) | null = null
  private onChatMessage: ((text: string, chatId: number) => Promise<string>) | null = null
  private _onProviderSetup: ((setup: ProviderSetup) => Promise<void>) | null = null
  // Setup wizard state per chat
  private setupWizards = new Map<number, SetupWizardState>()
  // Inline UX conversation flow per chat
  private chatFlows = new Map<number, ChatFlow>()
  // Active continuous research tasks
  private continuousResearch = new Map<string, ContinuousResearch>()
  // Maps Telegram chatId -> koda sessionID for persistent conversation context
  private chatSessions = new Map<number, string>()
  // Conversation history per chat (for direct LLM calls)
  private chatHistory = new Map<number, Array<{ role: string; content: string }>>()

  async connect(token: string, adminId: string): Promise<{ username?: string }> {
    const bot = new TelegramBot(token)
    const me = await bot.getMe()
    if (!me.ok) {
      throw new Error(`Invalid bot token: ${me.description ?? "Telegram rejected the token"}`)
    }
    this.bot = bot
    this.config = { token, adminId }
    bot.onText((msg) => this.handleMessage(msg))
    bot.onCallbackQuery((query) => this.handleCallback(query))
    bot.startPolling()
    return { username: me.result?.username }
  }

  disconnect(): void {
    this.bot?.stopPolling()
    this.bot = null
    // Stop all research tasks
    for (const task of this.researchTasks.values()) {
      task.status = "stopped"
    }
  }

  isConnected(): boolean {
    return this.bot !== null && this.bot.isPolling()
  }

  getConfig(): TelegramConfig | null {
    return this.config
  }

  async sendMessage(chatId: number | string, text: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram bot not connected")
    await this.bot.sendMessage(chatId, text)
  }

  onResearch(fn: (topic: string, chatId: number, task: ResearchTask) => Promise<void>): void {
    this.onResearchRequest = fn
  }

  onChat(fn: (text: string, chatId: number) => Promise<string>): void {
    this.onChatMessage = fn
  }

  onProviderSetup(fn: (setup: ProviderSetup) => Promise<void>): void {
    this._onProviderSetup = fn
  }

  private isAdmin(msg: TelegramMessage): boolean {
    return this.config !== null && String(msg.from.id) === this.config.adminId
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    if (!this.bot || !msg.text) return
    if (!this.isAdmin(msg)) {
      await this.bot.sendMessage(msg.chat.id, "Unauthorized. Only the admin can use this bot.")
      return
    }

    const text = msg.text.trim()
    const chatId = msg.chat.id

    // Setup wizard takes priority
    const wizard = this.setupWizards.get(chatId)
    if (wizard) {
      // Allow /cancel to abort
      if (text.toLowerCase() === "/cancel") {
        this.setupWizards.delete(chatId)
        await this.bot.sendMessage(chatId, "Setup cancelled.")
        return
      }
      await this.handleWizardStep(wizard, text, chatId)
      return
    }

    // Inline UX flow takes priority (after setup wizard)
    const flow = this.chatFlows.get(chatId)
    if (flow && flow.kind === "awaiting_topic" && !text.startsWith("/")) {
      this.chatFlows.set(chatId, { kind: "awaiting_duration", topic: text })
      await this.askResearchDuration(chatId)
      return
    }

    if (text.startsWith("/")) {
      await this.handleCommand(text, chatId)
    } else if (this.onChatMessage) {
      try {
        // Send "Thinking..." and edit it with the response (cleaner UI)
        const thinking = await this.bot.sendMessage(chatId, "_Thinking..._")
        await this.bot.sendChatAction(chatId, "typing")
        const response = await this.onChatMessage(text, chatId)
        await this.bot.editMessage(chatId, thinking.message_id, response, "Markdown")
      } catch (err) {
        await this.bot.sendMessage(chatId, `Error: ${err instanceof Error ? err.message : "unknown"}`)
      }
    }
  }

  /**
   * Handle inline keyboard button taps (callback queries).
   */
  private async handleCallback(query: import("./bot").TelegramCallbackQuery): Promise<void> {
    if (!this.bot) return
    const chatId = query.message?.chat.id
    if (!chatId || !this.isAdminMsg(query.from.id)) return

    await this.bot.answerCallbackQuery(query.id)
    const data = query.data ?? ""
    const msgId = query.message?.message_id

    if (data === "action_research") {
      this.chatFlows.set(chatId, { kind: "awaiting_topic" })
      await this.bot.editMessage(
        chatId,
        msgId!,
        "*Deep Research*\n\nSend me the topic you want to research:",
        "Markdown",
        { inline_keyboard: [[{ text: "Cancel", callback_data: "action_cancel" }]] },
      )
    } else if (data === "action_chat") {
      this.chatFlows.set(chatId, { kind: "idle" })
      await this.bot.editMessage(
        chatId,
        msgId!,
        "*Chat Mode*\n\nJust send me any message and I'll respond.",
        "Markdown",
        { inline_keyboard: [[{ text: "Back to Menu", callback_data: "action_menu" }]] },
      )
    } else if (data === "action_setup") {
      this.chatFlows.set(chatId, { kind: "idle" })
      this.setupWizards.set(chatId, { step: "providerId", providerId: "", baseURL: "", apiKey: "" })
      await this.bot.editMessage(
        chatId,
        msgId!,
        "*Provider Setup*\n\nEnter a Provider ID (lowercase, e.g. myprovider):\n\nSend /cancel to abort.",
        "Markdown",
      )
    } else if (data === "action_status") {
      const running = [...this.continuousResearch.values()].filter((r) => r.chatId === chatId)
      const llm = this.llmConfig ? `${this.llmConfig.providerId}/${this.llmConfig.modelId}` : "Not configured"
      const text =
        `*Status*\n\n` +
        `Model: ${llm}\n` +
        `Active research: ${running.length}\n` +
        (running.length > 0 ? running.map((r) => `- ${r.topic.slice(0, 40)}`).join("\n") : "")
      await this.bot.editMessage(chatId, msgId!, text, "Markdown", {
        inline_keyboard: [[{ text: "Back to Menu", callback_data: "action_menu" }]],
      })
    } else if (data === "action_menu") {
      this.chatFlows.set(chatId, { kind: "idle" })
      await this.sendMainMenu(chatId, msgId)
    } else if (data === "action_cancel") {
      this.chatFlows.set(chatId, { kind: "idle" })
      await this.sendMainMenu(chatId, msgId)
    } else if (data.startsWith("duration_")) {
      const flow = this.chatFlows.get(chatId)
      if (!flow || flow.kind !== "awaiting_duration") return
      const topic = flow.topic
      this.chatFlows.set(chatId, { kind: "idle" })

      // Parse duration: duration_15m, duration_1h, duration_6h, duration_skip
      const val = data.slice("duration_".length)

      if (val === "skip") {
        // One-time deep research report (3-step: plan -> gather -> synthesize)
        const progressMsg = await this.bot.sendMessage(chatId, "_Starting research..._")
        await this.bot.editMessage(chatId, msgId!, `*Research:* ${topic}\n\nGenerating one-time report...`, "Markdown")
        const onProgress = async (text: string) => {
          await this.bot!.editMessage(chatId, progressMsg.message_id, text, "Markdown").catch(() => {})
        }
        try {
          const report = await this.deepResearch(topic, onProgress)
          await this.bot.editMessage(
            chatId,
            progressMsg.message_id,
            `*Research: ${topic}*\n\n${report}`,
            "Markdown",
          )
        } catch (err) {
          await this.bot.editMessage(
            chatId,
            progressMsg.message_id,
            `Research failed: ${err instanceof Error ? err.message : "unknown error"}`,
          )
        }
        return
      }

      let durationMs: number | null = null
      let label = "continuous"
      if (val === "15m") { durationMs = 15 * 60 * 1000; label = "15 minutes" }
      else if (val === "1h") { durationMs = 60 * 60 * 1000; label = "1 hour" }
      else if (val === "6h") { durationMs = 6 * 60 * 60 * 1000; label = "6 hours" }

      await this.bot.editMessage(
        chatId,
        msgId!,
        `*Research started:* ${topic}\nDuration: ${label}\n\nI'll send unique findings periodically. Use /stop to cancel.`,
        "Markdown",
      )
      this.startContinuousResearch(topic, chatId, durationMs)
    } else if (data === "stop_research") {
      const stopped = this.stopResearchForChat(chatId)
      await this.bot.editMessage(
        chatId,
        msgId!,
        stopped ? "Research stopped." : "No active research.",
        "Markdown",
        { inline_keyboard: [[{ text: "Back to Menu", callback_data: "action_menu" }]] },
      )
    }
  }

  private isAdminMsg(userId: number): boolean {
    return this.config !== null && String(userId) === this.config.adminId
  }

  /** Main menu with inline keyboard */
  private async sendMainMenu(chatId: number, editMessageId?: number): Promise<void> {
    if (!this.bot) return
    const llm = this.llmConfig ? `${this.llmConfig.providerId}/${this.llmConfig.modelId}` : "Not configured"
    const text = `*Koda Bot*\n\nModel: ${llm}\n\nWhat would you like to do?`
    const keyboard = {
      inline_keyboard: [
        [
          { text: "Research", callback_data: "action_research" },
          { text: "Chat", callback_data: "action_chat" },
        ],
        [
          { text: "Setup Provider", callback_data: "action_setup" },
          { text: "Status", callback_data: "action_status" },
        ],
      ],
    }
    if (editMessageId) {
      await this.bot.editMessage(chatId, editMessageId, text, "Markdown", keyboard)
    } else {
      await this.bot.sendMessage(chatId, text, "Markdown", keyboard)
    }
  }

  /** Ask for research duration with inline buttons */
  private async askResearchDuration(chatId: number): Promise<void> {
    if (!this.bot) return
    await this.bot.sendMessage(chatId, "*How long should I research?*\n\nI'll keep finding new unique results for the whole duration.", "Markdown", {
      inline_keyboard: [
        [
          { text: "15 min", callback_data: "duration_15m" },
          { text: "1 hour", callback_data: "duration_1h" },
        ],
        [
          { text: "6 hours", callback_data: "duration_6h" },
          { text: "Skip (one report)", callback_data: "duration_skip" },
        ],
        [{ text: "Cancel", callback_data: "action_cancel" }],
      ],
    })
  }

  private async handleWizardStep(wizard: SetupWizardState, text: string, chatId: number): Promise<void> {
    if (!this.bot) return
    switch (wizard.step) {
      case "providerId": {
        const id = text.toLowerCase().replace(/[^a-z0-9-]/g, "-")
        if (!id) {
          await this.bot.sendMessage(chatId, "Invalid provider ID. Try again:")
          return
        }
        wizard.providerId = id
        wizard.step = "baseURL"
        await this.bot.sendMessage(chatId, "Enter the Base URL (OpenAI-compatible, e.g. https://api.example.com/v1):")
        break
      }
      case "baseURL": {
        const url = text
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          await this.bot.sendMessage(chatId, "Invalid URL. Must start with http:// or https://. Try again:")
          return
        }
        wizard.baseURL = url.replace(/\/$/, "")
        wizard.step = "apiKey"
        await this.bot.sendMessage(chatId, "Enter the API Key:")
        break
      }
      case "apiKey": {
        if (!text) {
          await this.bot.sendMessage(chatId, "API key cannot be empty. Try again:")
          return
        }
        wizard.apiKey = text
        wizard.step = "modelId"
        await this.bot.sendMessage(
          chatId,
          "Enter the Model ID (as expected by the API, e.g. gpt-4o):",
        )
        break
      }
      case "modelId": {
        const modelId = text
        if (!modelId) {
          await this.bot.sendMessage(chatId, "Model ID cannot be empty. Try again:")
          return
        }
        this.setupWizards.delete(chatId)
        if (!this._onProviderSetup) {
          await this.bot.sendMessage(chatId, "Error: Setup handler not wired.")
          return
        }
        await this.bot.sendMessage(chatId, "Saving provider...")
        try {
          await this._onProviderSetup({
            providerId: wizard.providerId,
            displayName: wizard.providerId,
            baseURL: wizard.baseURL,
            apiKey: wizard.apiKey,
            modelId,
            modelName: modelId,
          })
          // Update LLM config immediately
          this.llmConfig = {
            providerId: wizard.providerId,
            modelId,
            baseURL: wizard.baseURL,
            apiKey: wizard.apiKey,
          }
          await this.bot.sendMessage(
            chatId,
            `Provider "${wizard.providerId}" connected!\nModel: ${modelId}\n\nYou can now chat with me directly.`,
          )
        } catch (err) {
          await this.bot.sendMessage(
            chatId,
            `Setup failed: ${err instanceof Error ? err.message : "unknown error"}`,
          )
        }
        break
      }
    }
  }

  private async handleCommand(text: string, chatId: number): Promise<void> {
    if (!this.bot) return
    const [cmd, ...args] = text.split(/\s+/)
    const arg = args.join(" ")

    switch (cmd.toLowerCase()) {
      case "/start":
        this.chatFlows.set(chatId, { kind: "idle" })
        await this.sendMainMenu(chatId)
        break

      case "/help":
        await this.bot.sendMessage(
          chatId,
          `Commands:\n/research <topic> - Start deep research (or tap Research below)\n/stop - Stop active research\n/status - Show status\n/setup - Connect an OpenAI-compatible provider\n/model - Show current model\n\nTip: Use /start for the button menu.`,
        )
        break

      case "/research": {
        if (!arg) {
          // No topic given — start the inline flow
          this.chatFlows.set(chatId, { kind: "awaiting_topic" })
          await this.bot.sendMessage(chatId, "*Deep Research*\n\nSend me the topic you want to research:", "Markdown", {
            inline_keyboard: [[{ text: "Cancel", callback_data: "action_cancel" }]],
          })
          break
        }
        // Topic given directly — ask for duration
        let topic = arg
        const pipeIdx = arg.lastIndexOf("|")
        if (pipeIdx > 0) topic = arg.slice(0, pipeIdx).trim()
        this.chatFlows.set(chatId, { kind: "awaiting_duration", topic })
        await this.askResearchDuration(chatId)
        break
      }

      case "/stop": {
        const stopped = this.stopResearchForChat(chatId)
        await this.bot.sendMessage(chatId, stopped ? "Research stopped." : "No running research tasks.")
        break
      }

      case "/status": {
        const running = [...this.researchTasks.values()].filter((t) => t.status === "running")
        if (running.length === 0) {
          await this.bot.sendMessage(chatId, "No active research tasks.")
        } else {
          const lines = running.map((t) => {
            const elapsed = Math.round((Date.now() - t.startedAt) / 60000)
            return `- ${t.topic} (${elapsed} min elapsed, updates every ${t.updateIntervalMinutes} min)`
          })
          await this.bot.sendMessage(chatId, `Active research tasks:\n${lines.join("\n")}`)
        }
        break
      }

      case "/connect":
        await this.bot.sendMessage(
          chatId,
          "To connect a provider:\n- Use /setup to configure a provider here in Telegram\n- Or use the /connect command in the Koda TUI\n\nCustom OpenAI-compatible providers are supported.",
        )
        break

      case "/setup": {
        this.setupWizards.set(chatId, { step: "providerId", providerId: "", baseURL: "", apiKey: "" })
        await this.bot.sendMessage(
          chatId,
          "Provider Setup\n\nEnter a Provider ID (lowercase, e.g. myprovider):\n\nSend /cancel to abort.",
        )
        break
      }

      case "/model": {
        if (this.llmConfig) {
          await this.bot.sendMessage(
            chatId,
            `Current model: ${this.llmConfig.providerId}/${this.llmConfig.modelId}\nBase URL: ${this.llmConfig.baseURL}\n\nUse /setup to change it.`,
          )
        } else {
          await this.bot.sendMessage(
            chatId,
            "No model configured.\nUse /setup to connect a provider.",
          )
        }
        break
      }

      default:
        await this.bot.sendMessage(chatId, `Unknown command: ${cmd}\nUse /help for available commands.`)
    }
  }

  getTask(id: string): ResearchTask | undefined {
    return this.researchTasks.get(id)
  }

  getChatSession(chatId: number): string | undefined {
    return this.chatSessions.get(chatId)
  }

  setChatSession(chatId: number, sessionID: string): void {
    this.chatSessions.set(chatId, sessionID)
  }

  clearChatSessions(): void {
    this.chatSessions.clear()
    this.chatHistory.clear()
  }

  setLLMConfig(cfg: LLMConfig | null): void {
    this.llmConfig = cfg
  }

  getLLMConfig(): LLMConfig | null {
    return this.llmConfig
  }

  /**
   * Direct LLM call using the configured provider (OpenAI-compatible).
   * Uses plain fetch — no Effect context required.
   * Maintains conversation history per chat.
   */
  /**
   * Raw LLM call (no history). For multi-step flows like research.
   */
  async llmCall(messages: Array<{ role: string; content: string }>, system?: string): Promise<string> {
    if (!this.llmConfig) {
      throw new Error("LLM not configured. Use /setup to connect a provider.")
    }
    const { baseURL, apiKey, modelId } = this.llmConfig
    const url = `${baseURL.replace(/\/$/, "")}/chat/completions`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          ...messages,
        ],
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown")
      throw new Error(`LLM request failed: ${res.status} ${errText.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error) throw new Error(`LLM error: ${data.error.message}`)
    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) throw new Error("LLM returned empty response")
    return reply
  }

  async chatWithLLM(text: string, chatId: number): Promise<string> {
    // Get or init history
    let history = this.chatHistory.get(chatId)
    if (!history) {
      history = []
      this.chatHistory.set(chatId, history)
    }
    history.push({ role: "user", content: text })
    // Keep last 20 messages to bound context
    if (history.length > 20) history.splice(0, history.length - 20)

    const reply = await this.llmCall(
      history,
      "You are Koda, a helpful AI coding assistant. Respond concisely and helpfully. Use Telegram-compatible markdown (*bold*, _italic_, `code`).",
    )
    history.push({ role: "assistant", content: reply })
    return this.cleanMarkdown(reply)
  }

  /**
   * Convert LLM markdown to Telegram-compatible format.
   * Telegram supports *bold*, _italic_, `code`, [text](url).
   * Uses the robust sanitizer from TelegramBot (fixes unbalanced markers).
   */
  cleanMarkdown(text: string): string {
    return TelegramBot.sanitizeMarkdown(text)
  }

  /**
   * Multi-step research flow: plan -> gather -> synthesize.
   * Sends progress updates via the provided callback.
   */
  async deepResearch(
    topic: string,
    onProgress: (text: string) => Promise<void>,
  ): Promise<string> {
    // Step 1: Plan - break into key aspects
    await onProgress("*Researching:* Planning approach...")
    const plan = await this.llmCall(
      [{ role: "user", content: `Break down this research topic into 3-4 key aspects to investigate. List them briefly, one per line:\n\n${topic}` }],
      "You are a research planner. Be concise.",
    )
    const aspects = plan
      .split("\n")
      .map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 4)

    // Step 2: Gather - research each aspect
    const findings: string[] = []
    for (let i = 0; i < aspects.length; i++) {
      await onProgress(`*Researching:* Gathering info (${i + 1}/${aspects.length})...\n_${aspects[i].slice(0, 60)}_`)
      const info = await this.llmCall(
        [
          {
            role: "user",
            content: `Research this aspect in detail: "${aspects[i]}"\n\nContext topic: ${topic}\n\nProvide key facts, insights, and details.`,
          },
        ],
        "You are a thorough researcher. Provide factual, detailed information.",
      )
      findings.push(`*${aspects[i]}*\n${info}`)
    }

    // Step 3: Synthesize - final report
    await onProgress("*Researching:* Writing final report...")
    const report = await this.llmCall(
      [
        {
          role: "user",
          content: `Synthesize this research into a comprehensive report on "${topic}":\n\n${findings.join("\n\n---\n\n")}\n\nStructure with: *Overview*, key findings per aspect, and a *Recommendation* section.`,
        },
      ],
      "You are a report writer. Create well-structured, insightful reports using *bold* for headers.",
    )
    return this.cleanMarkdown(report)
  }

  /**
   * Start continuous research that keeps finding UNIQUE new results
   * for the given duration (or until stopped).
   * Each iteration asks the LLM for fresh angles not covered before.
   */
  startContinuousResearch(topic: string, chatId: number, durationMs: number | null): void {
    if (!this.bot) return
    const id = `cresearch-${Date.now()}`
    // Stop any existing research for this chat first
    this.stopResearchForChat(chatId)

    const intervalMs = durationMs === null ? 10 * 60 * 1000 : Math.max(2 * 60 * 1000, Math.min(durationMs / 4, 15 * 60 * 1000))
    const research: ContinuousResearch = {
      topic,
      chatId,
      startedAt: Date.now(),
      endsAt: durationMs === null ? null : Date.now() + durationMs,
      intervalMs,
      timer: null,
      previousFindings: [],
      updateCount: 0,
    }
    this.continuousResearch.set(id, research)

    const runIteration = async () => {
      // Check if still active and within time
      if (!this.continuousResearch.has(id)) return
      if (research.endsAt !== null && Date.now() >= research.endsAt) {
        this.continuousResearch.delete(id)
        await this.bot?.sendMessage(
          chatId,
          `*Research complete:* ${topic}\n\nTime's up! Sent ${research.updateCount} updates.`,
          "Markdown",
          { inline_keyboard: [[{ text: "Back to Menu", callback_data: "action_menu" }]] },
        )
        return
      }

      try {
        research.updateCount++
        await this.bot?.sendChatAction(chatId, "typing")

        // Ask for FRESH findings not covered before
        const prevSummary =
          research.previousFindings.length > 0
            ? `\n\nAlready covered (DO NOT repeat):\n${research.previousFindings.slice(-3).join("\n---\n")}`
            : ""
        const prompt =
          research.updateCount === 1
            ? `Research this topic and give the most important initial findings: "${topic}". Be specific with facts, numbers, names, dates.`
            : `Continue researching "${topic}". Find NEW, UNIQUE information not covered before. Explore a different angle, recent developments, or deeper details.${prevSummary}\n\nIf there's genuinely nothing new, say "NO_NEW_FINDINGS".`

        const findings = await this.llmCall(
          [{ role: "user", content: prompt }],
          "You are a thorough researcher. Provide specific, factual information. Use *bold* for key terms.",
        )

        if (findings.includes("NO_NEW_FINDINGS")) {
          // Nothing new, wait for next interval
        } else {
          const clean = TelegramBot.sanitizeMarkdown(findings)
          research.previousFindings.push(clean.slice(0, 500))
          // Keep only last 5 to bound context
          if (research.previousFindings.length > 5) research.previousFindings.shift()

          await this.bot?.sendMessage(
            chatId,
            `*Update #${research.updateCount}:* ${topic}\n\n${clean}`,
            "Markdown",
            {
              inline_keyboard: [[{ text: "Stop Research", callback_data: "stop_research" }]],
            },
          )
        }
      } catch (err) {
        console.error("Continuous research iteration error:", err)
      }

      // Schedule next iteration
      if (this.continuousResearch.has(id)) {
        research.timer = setTimeout(runIteration, intervalMs)
      }
    }

    // Start first iteration immediately
    runIteration()
  }

  /** Stop all continuous research for a chat. Returns true if anything was stopped. */
  stopResearchForChat(chatId: number): boolean {
    let stopped = false
    for (const [id, r] of this.continuousResearch) {
      if (r.chatId === chatId) {
        if (r.timer) clearTimeout(r.timer)
        this.continuousResearch.delete(id)
        stopped = true
      }
    }
    // Also stop legacy tasks
    for (const task of this.researchTasks.values()) {
      if (task.chatId === chatId && task.status === "running") {
        task.status = "stopped"
        stopped = true
      }
    }
    return stopped
  }

  getRunningTasks(): ResearchTask[] {
    return [...this.researchTasks.values()].filter((t) => t.status === "running")
  }

  updateTaskProgress(id: string): void {
    const task = this.researchTasks.get(id)
    if (task) task.lastUpdateAt = Date.now()
  }

  shouldSendUpdate(task: ResearchTask): boolean {
    if (task.status !== "running") return false
    // Check max duration
    if (task.maxDurationHours !== null) {
      const elapsedHours = (Date.now() - task.startedAt) / (1000 * 60 * 60)
      if (elapsedHours >= task.maxDurationHours) {
        task.status = "completed"
        return false
      }
    }
    // Check interval
    const sinceLastUpdate = Date.now() - task.lastUpdateAt
    return sinceLastUpdate >= task.updateIntervalMinutes * 60 * 1000
  }
}

// Singleton instance
let instance: TelegramService | null = null
export function getTelegramService(): TelegramService {
  if (!instance) instance = new TelegramService()
  return instance
}
