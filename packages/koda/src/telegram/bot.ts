/**
 * Telegram Bot API client using raw HTTP (no external dependencies).
 * Uses long polling for receiving updates.
 */

export interface TelegramMessage {
  message_id: number
  from: { id: number; username?: string; first_name: string }
  chat: { id: number; type: string }
  text?: string
  date: number
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export class TelegramBot {
  private token: string
  private baseUrl: string
  private polling = false
  private offset = 0
  private onMessage: ((msg: TelegramMessage) => Promise<void>) | null = null

  constructor(token: string) {
    this.token = token
    this.baseUrl = `https://api.telegram.org/bot${token}`
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    parseMode?: "Markdown" | "HTML",
  ): Promise<{ message_id: number }> {
    // Telegram has a 4096 char limit per message — split if needed
    // For simplicity, only the first chunk returns message_id; rest are follow-ups
    const chunks = this.splitMessage(text)
    let firstId = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
      }
      if (parseMode) body.parse_mode = parseMode
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => "unknown")
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
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4000),
    }
    if (parseMode) body.parse_mode = parseMode
    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // If edit fails (e.g. message not modified), fall back to sending new
      await this.sendMessage(chatId, text, parseMode)
    }
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
          body: JSON.stringify({ offset: this.offset, timeout: 30 }),
        })
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }
        const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] }
        if (data.ok && data.result) {
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1)
            if (update.message?.text && this.onMessage) {
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
