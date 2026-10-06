import { createSignal, Show } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"

export function DialogTelegram() {
  const dialog = useDialog()
  const toast = useToast()
  const [step, setStep] = createSignal<"menu" | "token" | "adminId">("menu")
  const [token, setToken] = createSignal("")

  const menuOptions = [
    {
      value: "connect",
      title: "Connect Bot",
      description: "Enter bot token and admin ID to connect",
      onSelect: () => setStep("token"),
    },
    {
      value: "disconnect",
      title: "Disconnect",
      description: "Disconnect the Telegram bot",
      onSelect: () => {
        toast.show({ message: "Use the telegram tool to disconnect: ask me to disconnect Telegram", variant: "info" })
        dialog.clear()
      },
    },
    {
      value: "status",
      title: "Status",
      description: "Check Telegram connection status",
      onSelect: () => {
        toast.show({ message: "Ask me 'telegram status' to check connection", variant: "info" })
        dialog.clear()
      },
    },
  ]

  return (
    <Show
      when={step() === "menu"}
      fallback={
        <Show
          when={step() === "token"}
          fallback={
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
                dialog.clear()
                if (adminId) {
                  toast.show({
                    message: "Now ask me: 'connect telegram with token " + token().slice(0, 10) + "... and admin ID " + adminId + "'",
                    variant: "info",
                  })
                }
              }}
              onCancel={() => setStep("menu")}
            />
          }
        >
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
      }
    >
      <DialogSelect
        title="Telegram Bot"
        options={menuOptions}
      />
    </Show>
  )
}
