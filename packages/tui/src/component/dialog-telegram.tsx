import { createSignal, Show } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useSDK } from "../context/sdk"

export function DialogTelegram() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [step, setStep] = createSignal<"menu" | "token" | "adminId" | "working" | "status">("menu")
  const [token, setToken] = createSignal("")
  const [statusInfo, setStatusInfo] = createSignal("")

  const connectBot = async (botToken: string, adminId: string) => {
    setStep("working")
    try {
      const result = await (sdk.client as any).telegram.connect(
        { token: botToken, adminId },
        { throwOnError: true },
      )
      toast.show({
        message: result.username ? `Connected to @${result.username}` : "Telegram bot connected",
        variant: "success",
      })
      dialog.clear()
    } catch (err) {
      toast.show({
        message: `Connection failed: ${err instanceof Error ? err.message : "unknown error"}`,
        variant: "error",
      })
      setStep("menu")
    }
  }

  const disconnectBot = async () => {
    setStep("working")
    try {
      await (sdk.client as any).telegram.disconnect({}, { throwOnError: true })
      toast.show({ message: "Telegram bot disconnected", variant: "success" })
      dialog.clear()
    } catch (err) {
      toast.show({
        message: `Failed: ${err instanceof Error ? err.message : "unknown"}`,
        variant: "error",
      })
      setStep("menu")
    }
  }

  const checkStatus = async () => {
    setStep("working")
    try {
      const result = await (sdk.client as any).telegram.status({}, { throwOnError: true })
      setStatusInfo(
        result.connected
          ? `Connected. ${result.runningTasks} active research task(s).`
          : "Not connected.",
      )
      setStep("status")
    } catch (err) {
      toast.show({
        message: `Failed: ${err instanceof Error ? err.message : "unknown"}`,
        variant: "error",
      })
      setStep("menu")
    }
  }

  // Options as plain array (not memo) for stable references
  const options = [
    {
      key: "connect",
      value: "connect",
      title: "Connect Bot",
      description: "Enter bot token and admin ID to connect",
      onSelect: () => setStep("token"),
    },
    {
      key: "disconnect",
      value: "disconnect",
      title: "Disconnect",
      description: "Disconnect the Telegram bot",
      onSelect: () => disconnectBot(),
    },
    {
      key: "status",
      value: "status",
      title: "Status",
      description: "Check Telegram connection status",
      onSelect: () => checkStatus(),
    },
  ]

  return (
    <Show when={step() === "menu"} fallback={
      <Show when={step() === "token"} fallback={
        <Show when={step() === "adminId"} fallback={
          <Show when={step() === "status"} fallback={
            <box flexDirection="column" gap={1} padding={1}>
              <text>Working...</text>
            </box>
          }>
            <box flexDirection="column" gap={1} padding={1}>
              <text>Telegram Status</text>
              <text>{statusInfo()}</text>
            </box>
          </Show>
        }>
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
              if (adminId && token()) {
                connectBot(token(), adminId)
              }
            }}
            onCancel={() => setStep("menu")}
          />
        </Show>
      }>
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
              setToken(t)
              setStep("adminId")
            }
          }}
          onCancel={() => setStep("menu")}
        />
      </Show>
    }>
      <DialogSelect
        title="Telegram Bot"
        options={options}
        flat={true}
      />
    </Show>
  )
}
