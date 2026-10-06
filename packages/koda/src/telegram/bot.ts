/**
 * Telegram Bot API client using raw HTTP (no external dependencies).
 * Uses long polling for receiving updates.
 * Supports Bot API 10.3 features: inline keyboards, callback queries,
 * disabled buttons, force_reply.
 */

export interface TelegramMessage {
  message_id: number
  from: { id: number; username?: string; first_name: string }
  chat: { id: number; type: string }
  text?: string
  date: number
  reply_markup?: unknown
}

export interface TelegramCallbackQuery {
  id: string
  from: { id: number; username?: string; first_name: string }
  message?: TelegramMessage
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
  /** Bot API 10.3: disabled buttons (shown greyed out) */
  disabled?: boolean
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export class TelegramBot {
  private token: string
  private baseUrl: string
  private polling = false
  private offset = 0
  private onMessage: ((msg: TelegramMessage) => Promise<void>) | null = null
  private onCallback: ((query: TelegramCallbackQuery) => Promise<void>) | null = null

  constructor(token: string) {
    this.token = token
    this.baseUrl = `https://api.telegram.org/bot${token}`
  }

  /**
   * Sanitize text for Telegram Markdown parse mode.
   * Fixes unbalanced markers that cause "can't parse entities" errors.
   * Converts **bold** to *bold*, removes broken entities.
   */
  static sanitizeMarkdown(text: string): string {
    let out = text
    // **bold** -> *bold*
    out = out.replace(/\*\*([^*]+?)\*\*/g, "*$1*")
    // ## headers -> *bold*
    out = out.replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Remove excessive blank lines
    out = out.replace(/\n{3,}/g, "\n\n")

    // Fix unbalanced markers: count * and _ and `, remove trailing unclosed ones
    // Split by lines and process each to avoid cross-line entity issues
    const lines = out.split("\n")
    const fixed = lines.map((line) => {
      // Count unescaped markers
      const stars = (line.match(/(?<!\\)\*/g) || []).length
      const underscores = (line.match(/(?<!\\)_/g) || []).length
      const backticks = (line.match(/(?<!\\)`/g) || []).length
      // If odd count, the last one is unclosed — escape it
      let l = line
      if (stars % 2 === 1) {
        const idx = l.lastIndexOf("*")
        l = l.slice(0, idx) + "\\*" + l.slice(idx + 1)
      }
      if (underscores % 2 === 1) {
        const idx = l.lastIndexOf("_")
        l = l.slice(0, idx) + "\\_" + l.slice(idx + 1)
      }
      if (backticks % 2 === 1) {
        const idx = l.lastIndexOf("`")
        l = l.slice(0, idx) + "\\`" + l.slice(idx + 1)
      }
      return l
    })
    return fixed.join("\n").trim()
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    parseMode?: "Markdown" | "HTML",
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<{ message_id: number }> {
    const safeText = parseMode === "Markdown" ? TelegramBot.sanitizeMarkdown(text) : text
    const chunks = this.splitMessage(safeText)
    let firstId = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
      }
      if (parseMode) body.parse_mode = parseMode
      // Only attach keyboard to the last chunk
      if (replyMarkup && i === chunks.length - 1) body.reply_markup = replyMarkup
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => "unknown")
        // If Markdown parsing fails, retry as plain text
        if (parseMode && err.includes("can't parse entities")) {
          return this.sendMessage(chatId, text, undefined, replyMarkup)
        }
        throw new Error(`Telegram sendMessage failed: ${res.status} ${err}`)
      }
      if (i === 0) {
        const data = (await res.json()) as { result?: { message_id?: number } }
        firstId = data.result?.message_id ?? 0
      }
    }
    return { message_id: firstId }
  }

  async editMessage(
    chatId: number | string,
    messageId: number,
    text: string,
    parseMode?: "Markdown" | "HTML",
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<void> {
    const safeText = parseMode === "Markdown" ? TelegramBot.sanitizeMarkdown(text) : text
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: safeText.slice(0, 4000),
    }
    if (parseMode) body.parse_mode = parseMode
    if (replyMarkup) body.reply_markup = replyMarkup
    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => "unknown")
      // If Markdown parsing fails, retry as plain text
      if (parseMode && err.includes("can't parse entities")) {
        await this.editMessage(chatId, messageId, text, undefined, replyMarkup)
        return
      }
      // If edit fails (e.g. message not modified), fall back to sending new
      if (!err.includes("message is not modified")) {
        await this.sendMessage(chatId, text, parseMode, replyMarkup)
      }
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    }).catch(() => {})
  }

  async sendChatAction(chatId: number | string, action: string = "typing"): Promise<void> {
    await fetch(`${this.baseUrl}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    }).catch(() => {})
  }

  private splitMessage(text: string, maxLen = 4000): string[] {
    if (text.length <= maxLen) return [text]
    const chunks: string[] = []
    let current = ""
    for (const line of text.split("\n")) {
      if ((current + line + "\n").length > maxLen) {
        if (current) chunks.push(current)
        current = line + "\n"
      } else {
        current += line + "\n"
      }
    }
    if (current) chunks.push(current)
    return chunks.length > 0 ? chunks : [text.slice(0, maxLen)]
  }

  async getMe(): Promise<{ ok: boolean; result?: { username: string }; description?: string }> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/getMe`)
    } catch (err) {
      throw new Error(
        `Could not reach Telegram API: ${err instanceof Error ? err.message : "network error"}. Check your network connection.`,
      )
    }
    let data: { ok: boolean; result?: { username: string }; description?: string }
    try {
      data = (await res.json()) as { ok: boolean; result?: { username: string }; description?: string }
    } catch {
      throw new Error(`Telegram API returned invalid response (HTTP ${res.status})`)
    }
    return data
  }

  onText(handler: (msg: TelegramMessage) => Promise<void>): void {
    this.onMessage = handler
  }

  onCallbackQuery(handler: (query: TelegramCallbackQuery) => Promise<void>): void {
    this.onCallback = handler
  }

  startPolling(): void {
    if (this.polling) return
    this.polling = true
    this.pollLoop().catch((err) => {
      console.error("Telegram polling error:", err)
      this.polling = false
    })
  }

  stopPolling(): void {
    this.polling = false
  }

  isPolling(): boolean {
    return this.polling
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const res = await fetch(`${this.baseUrl}/getUpdates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: this.offset,
            timeout: 30,
            allowed_updates: ["message", "callback_query"],
          }),
        })
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }
        const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] }
        if (data.ok && data.result) {
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1)
            if (update.callback_query && this.onCallback) {
              await this.onCallback(update.callback_query).catch((err) =>
                console.error("Callback handler error:", err),
              )
            } else if (update.message?.text && this.onMessage) {
              await this.onMessage(update.message).catch((err) => console.error("Message handler error:", err))
            }
          }
        }
      } catch (err) {
        console.error("Poll error:", err)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
}
