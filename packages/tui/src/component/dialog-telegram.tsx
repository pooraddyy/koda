import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useSDK } from "../context/sdk"

function TelegramMenu() {
  const dialog = useDialog()

  const options = [
    {
      key: "connect",
      value: "connect",
      title: "Connect Bot",
      description: "Enter bot token and admin ID to connect",
      onSelect: () => dialog.replace(() => <TelegramTokenInput />),
    },
    {
      key: "disconnect",
      value: "disconnect",
      title: "Disconnect",
      description: "Disconnect the Telegram bot",
      onSelect: () => dialog.replace(() => <TelegramDisconnect />),
    },
    {
      key: "status",
      value: "status",
      title: "Status",
      description: "Check Telegram connection status",
      onSelect: () => dialog.replace(() => <TelegramStatus />),
    },
  ]

  return <DialogSelect title="Telegram Bot" options={options} flat={true} skipFilter={true} />
}

function TelegramTokenInput() {
  const dialog = useDialog()

  return (
    <DialogPrompt
      title="Connect Telegram Bot"
      description={() => (
        <box flexDirection="column">
          <text>Enter your Telegram bot token.</text>
          <text>Get one from @BotFather on Telegram.</text>
        </box>
      )}
      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
      onConfirm={(v) => {
        const t = v.trim()
        if (t) {
          dialog.replace(() => <TelegramAdminInput token={t} />)
        }
      }}
      onCancel={() => dialog.replace(() => <TelegramMenu />)}
    />
  )
}

function TelegramAdminInput(props: { token: string }) {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()

  const connectBot = async (botToken: string, adminId: string) => {
    dialog.replace(() => <TelegramWorking />)
    // First, test direct network access from koda process
    try {
      const testRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
      const testData = (await testRes.json()) as { ok: boolean; description?: string }
      if (!testData.ok) {
        toast.show({
          message: `Connection failed: Invalid bot token (${testData.description ?? "rejected by Telegram"})`,
          variant: "error",
        })
        dialog.replace(() => <TelegramMenu />)
        return
      }
    } catch (netErr) {
      toast.show({
        message: `Connection failed: koda cannot reach Telegram API (${netErr instanceof Error ? netErr.message : "network error"})`,
        variant: "error",
      })
      dialog.replace(() => <TelegramMenu />)
      return
    }
    try {
      const result = await sdk.client.telegram.connect(
        { telegramConnectInput: { token: botToken, adminId } },
        { throwOnError: true },
      )
      // Check if server returned an error in the response
      if (result.data.error) {
        toast.show({
          message: `Connection failed: ${result.data.error}`,
          variant: "error",
        })
        dialog.replace(() => <TelegramMenu />)
        return
      }
      toast.show({
        message: result.data.username ? `Connected to @${result.data.username}` : "Telegram bot connected",
        variant: "success",
      })
      dialog.clear()
    } catch (err) {
      // Extract ref ID and details for debugging
      const cause = err instanceof Error ? (err as any).cause : undefined
      const ref = cause?.body?.data?.ref || cause?.body?.ref || ""
      const detail = ref ? ` (ref: ${ref})` : ""
      toast.show({
        message: `Connection failed: ${err instanceof Error ? err.message : "unknown error"}${detail}`,
        variant: "error",
      })
      dialog.replace(() => <TelegramMenu />)
    }
  }

  return (
    <DialogPrompt
      title="Telegram Admin ID"
      description={() => (
        <box flexDirection="column">
          <text>Enter your Telegram user ID (numbers only).</text>
          <text>Get it from @userinfobot on Telegram.</text>
        </box>
      )}
      placeholder="123456789"
      onConfirm={(v) => {
        const adminId = v.trim()
        if (adminId) {
          void connectBot(props.token, adminId)
        }
      }}
      onCancel={() => dialog.replace(() => <TelegramMenu />)}
    />
  )
}

function TelegramWorking() {
  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text>Working...</text>
    </box>
  )
}

function TelegramStatus() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()

  // Fetch status on mount
  void (async () => {
    try {
      const result = await sdk.client.telegram.status({ throwOnError: true })
      const text = result.data.connected
        ? `Connected. ${result.data.runningTasks} active research task(s).`
        : "Not connected."
      // Re-render with status
      dialog.replace(() => <TelegramStatusView text={text} />)
    } catch (err) {
      toast.show({
        message: `Failed: ${err instanceof Error ? err.message : "unknown"}`,
        variant: "error",
      })
      dialog.replace(() => <TelegramMenu />)
    }
  })()

  return <TelegramWorking />
}

function TelegramStatusView(props: { text: string }) {
  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text>Telegram Status</text>
      <text>{props.text}</text>
      <text>Press ESC to close</text>
    </box>
  )
}

function TelegramDisconnect() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()

  void (async () => {
    try {
      await sdk.client.telegram.disconnect({ throwOnError: true })
      toast.show({ message: "Telegram bot disconnected", variant: "success" })
      dialog.clear()
    } catch (err) {
      toast.show({
        message: `Failed: ${err instanceof Error ? err.message : "unknown"}`,
        variant: "error",
      })
      dialog.replace(() => <TelegramMenu />)
    }
  })()

  return <TelegramWorking />
}

export function DialogTelegram() {
  return <TelegramMenu />
}
