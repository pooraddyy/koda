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

/**
 * Telegram integration service.
 * Manages bot connection, command handling, and research task updates.
 */
export class TelegramService {
  private bot: TelegramBot | null = null
  private config: TelegramConfig | null = null
  private researchTasks = new Map<string, ResearchTask>()
  private onResearchRequest: ((topic: string, chatId: number, task: ResearchTask) => Promise<void>) | null = null
  private onChatMessage: ((text: string, chatId: number) => Promise<string>) | null = null
  // Maps Telegram chatId -> koda sessionID for persistent conversation context
  private chatSessions = new Map<number, string>()

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

    if (text.startsWith("/")) {
      await this.handleCommand(text, chatId)
    } else if (this.onChatMessage) {
      try {
        await this.bot.sendMessage(chatId, "Thinking...")
        const response = await this.onChatMessage(text, chatId)
        await this.bot.sendMessage(chatId, response)
      } catch (err) {
        await this.bot.sendMessage(chatId, `Error: ${err instanceof Error ? err.message : "unknown"}`)
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
          `Welcome to Koda Research Bot!\n\nCommands:\n/research <topic> - Start deep research\n/research <topic> | <hours>h - Research with time limit\n/research <topic> | <minutes>m - Research with update interval\n/stop - Stop current research\n/status - Show active tasks\n/connect - Show connection info\n/help - Show this help\n\nYou can also just chat with me directly.`,
        )
        break

      case "/help":
        await this.bot.sendMessage(
          chatId,
          `Commands:\n/research <topic> - Start deep research on a topic\n  Example: /research artificial intelligence trends\n  With time limit: /research AI trends | 2h\n  With update interval: /research AI trends | 30m\n/stop - Stop all running research tasks\n/status - Show active research tasks\n/connect - Show provider connection info\n/help - Show this help`,
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
        // Parse options: "topic | 2h" or "topic | 30m"
        let topic = arg
        let maxHours: number | null = null
        let intervalMin = 30
        const pipeIdx = arg.lastIndexOf("|")
        if (pipeIdx > 0) {
          topic = arg.slice(0, pipeIdx).trim()
          const opt = arg
            .slice(pipeIdx + 1)
            .trim()
            .toLowerCase()
          const hMatch = opt.match(/^(\d+(?:\.\d+)?)\s*h$/)
          const mMatch = opt.match(/^(\d+)\s*m$/)
          if (hMatch) maxHours = parseFloat(hMatch[1])
          else if (mMatch) intervalMin = parseInt(mMatch[1])
        }
        const task: ResearchTask = {
          id: `research-${Date.now()}`,
          topic,
          chatId,
          updateIntervalMinutes: intervalMin,
          maxDurationHours: maxHours,
          startedAt: Date.now(),
          lastUpdateAt: Date.now(),
          status: "running",
        }
        this.researchTasks.set(task.id, task)
        await this.bot.sendMessage(
          chatId,
          `Research started on: "${topic}"\nUpdates every ${intervalMin} min${maxHours ? ` for ${maxHours}h` : " until stopped"}.\nUse /stop to cancel.`,
        )
        if (this.onResearchRequest) {
          this.onResearchRequest(topic, chatId, task).catch((err) =>
            this.bot?.sendMessage(chatId, `Research error: ${err instanceof Error ? err.message : "unknown"}`),
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
          "To connect a provider, use the /connect command in the Koda TUI.\nCustom OpenAI-compatible providers are supported.",
        )
        break

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
