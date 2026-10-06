import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"

export namespace DialogTelegram {
  export async function show(
    dialog: ReturnType<typeof useDialog>,
    toast: ReturnType<typeof useToast>,
    onConnect: (token: string, adminId: string) => Promise<{ username?: string }>,
  ): Promise<boolean> {
    // Step 1: Bot token
    const token = await new Promise<string | null>((resolve) => {
      dialog.replace(() => (
        <DialogPrompt
          title="Connect Telegram Bot"
          description={() => (
            <>
              Enter your Telegram bot token.
              <br />
              Get one from @BotFather on Telegram.
            </>
          )}
          placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
          onConfirm={(v) => {
            dialog.clear()
            resolve(v.trim() || null)
          }}
          onCancel={() => {
            dialog.clear()
            resolve(null)
          }}
        />
      ))
    })
    if (!token) return false

    // Step 2: Admin ID
    const adminId = await new Promise<string | null>((resolve) => {
      dialog.replace(() => (
        <DialogPrompt
          title="Telegram Admin ID"
          description={() => (
            <>
              Enter your Telegram user ID (numbers only).
              <br />
              Get it from @userinfobot on Telegram.
            </>
          )}
          placeholder="123456789"
          onConfirm={(v) => {
            dialog.clear()
            resolve(v.trim() || null)
          }}
          onCancel={() => {
            dialog.clear()
            resolve(null)
          }}
        />
      ))
    })
    if (!adminId) return false

    try {
      const result = await onConnect(token, adminId)
      toast.show({
        message: result.username ? `Connected to @${result.username}` : "Telegram connected",
        variant: "success",
      })
      return true
    } catch (err) {
      toast.show({
        message: `Failed: ${err instanceof Error ? err.message : "unknown error"}`,
        variant: "error",
      })
      return false
    }
  }
}
