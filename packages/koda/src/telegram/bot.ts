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

  async sendMessage(chatId: number | string, text: string, parseMode?: "Markdown" | "HTML"): Promise<boolean> {
    // Telegram has a 4096 char limit per message — split if needed
    const chunks = this.splitMessage(text)
    for (const chunk of chunks) {
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
    }
    return true
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

  async getMe(): Promise<{ ok: boolean; result?: { username: string } }> {
    const res = await fetch(`${this.baseUrl}/getMe`)
    return (await res.json()) as { ok: boolean; result?: { username: string } }
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
              await this.onMessage(update.message).catch((err) =>
                console.error("Message handler error:", err),
              )
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
