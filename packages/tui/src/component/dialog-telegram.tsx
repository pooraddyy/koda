import { createSignal, Show, For } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useSDK } from "../context/sdk"
import { useBindings } from "../keymap"

export function DialogTelegram() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [step, setStep] = createSignal<"menu" | "token" | "adminId" | "working" | "status">("menu")
  const [token, setToken] = createSignal("")
  const [statusInfo, setStatusInfo] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const menuItems = [
    { id: "connect", title: "Connect Bot", desc: "Enter bot token and admin ID" },
    { id: "disconnect", title: "Disconnect", desc: "Disconnect the Telegram bot" },
    { id: "status", title: "Status", desc: "Check connection status" },
  ]

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

  const selectItem = (index: number) => {
    const item = menuItems[index]
    if (!item) return
    if (item.id === "connect") setStep("token")
    else if (item.id === "disconnect") disconnectBot()
    else if (item.id === "status") checkStatus()
  }

  // Keyboard bindings for menu
  useBindings(() => ({
    commands: [
      {
        name: "telegram.menu.up",
        run: () => {
          if (step() !== "menu") return
          setSelectedIndex((i) => (i > 0 ? i - 1 : menuItems.length - 1))
        },
      },
      {
        name: "telegram.menu.down",
        run: () => {
          if (step() !== "menu") return
          setSelectedIndex((i) => (i < menuItems.length - 1 ? i + 1 : 0))
        },
      },
      {
        name: "telegram.menu.select",
        run: () => {
          if (step() !== "menu") return
          selectItem(selectedIndex())
        },
      },
    ],
  }))

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
              <text>Press ESC to close</text>
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
      <box flexDirection="column" padding={1} gap={1}>
        <text>Telegram Bot</text>
        <box flexDirection="column">
          <For each={menuItems}>
            {(item, index) => (
              <box
                flexDirection="row"
                gap={2}
                backgroundColor={selectedIndex() === index() ? "blue" : undefined}
                onMouseUp={() => selectItem(index())}
              >
                <text>{selectedIndex() === index() ? ">" : " "}</text>
                <box flexDirection="column">
                  <text>{item.title}</text>
                  <text>{item.desc}</text>
                </box>
              </box>
            )}
          </For>
        </box>
        <text>Use arrow keys + Enter, or click</text>
      </box>
    </Show>
  )
}
