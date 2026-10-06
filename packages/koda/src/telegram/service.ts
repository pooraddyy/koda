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
        await this.bot.sendMessage(
          chatId,
          `Welcome to Koda Research Bot!\n\nCommands:\n/research <topic> - Start deep research\n/research <topic> | <hours>h - Research with time limit\n/research <topic> | <minutes>m - Research with update interval\n/stop - Stop current research\n/status - Show active tasks\n/setup - Connect a provider (model) via Telegram\n/model - Show current model\n/connect - Show connection info\n/help - Show this help\n\nYou can also just chat with me directly.`,
        )
        break

      case "/help":
        await this.bot.sendMessage(
          chatId,
          `Commands:\n/research <topic> - Start deep research on a topic\n  Example: /research artificial intelligence trends\n  With time limit: /research AI trends | 2h\n  With update interval: /research AI trends | 30m\n/stop - Stop all running research tasks\n/status - Show active research tasks\n/setup - Connect an OpenAI-compatible provider\n/model - Show current model\n/connect - Show provider connection info\n/help - Show this help`,
        )
        break

      case "/research": {
        if (!arg) {
          await this.bot.sendMessage(
            chatId,
            "Usage: /research <topic>\nExample: /research quantum computing breakthroughs",
          )
          break
        }
        // Parse topic (ignore | options for now, do full research immediately)
        let topic = arg
        const pipeIdx = arg.lastIndexOf("|")
        if (pipeIdx > 0) topic = arg.slice(0, pipeIdx).trim()

        const task: ResearchTask = {
          id: `research-${Date.now()}`,
          topic,
          chatId,
          updateIntervalMinutes: 30,
          maxDurationHours: null,
          startedAt: Date.now(),
          lastUpdateAt: Date.now(),
          status: "running",
        }
        this.researchTasks.set(task.id, task)

        // Send progress message and update it as research proceeds
        const progressMsg = await this.bot.sendMessage(chatId, "_Starting research..._")
        const onProgress = async (text: string) => {
          await this.bot!.editMessage(chatId, progressMsg.message_id, text, "Markdown").catch(() => {})
        }

        try {
          const report = await this.deepResearch(topic, onProgress)
          task.status = "completed"
          // Edit progress message into the final report
          await this.bot.editMessage(
            chatId,
            progressMsg.message_id,
            `*Research: ${topic}*\n\n${report}`,
            "Markdown",
          )
        } catch (err) {
          task.status = "stopped"
          await this.bot.editMessage(
            chatId,
            progressMsg.message_id,
            `Research failed: ${err instanceof Error ? err.message : "unknown error"}`,
          )
        }
        break
      }

      case "/stop": {
        let stopped = 0
        for (const task of this.researchTasks.values()) {
          if (task.status === "running") {
            task.status = "stopped"
            stopped++
          }
        }
        await this.bot.sendMessage(
          chatId,
          stopped > 0 ? `Stopped ${stopped} research task(s).` : "No running research tasks.",
        )
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
   */
  cleanMarkdown(text: string): string {
    return (
      text
        // **bold** -> *bold*
        .replace(/\*\*([^*]+)\*\*/g, "*$1*")
        // ## headers -> *bold*
        .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
        // Remove excessive blank lines
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    )
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
