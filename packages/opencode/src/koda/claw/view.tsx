/**
 * kodaClaw full-screen view
 *
 * Main layout component for the /kodaclaw route.
 * Renders a chat panel on the left and a status sidebar on the right.
 * Escape navigates back to the previous route.
 */

import { createMemo } from "solid-js"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useDialog } from "@tui/ui/dialog"
import { useBindings } from "@tui/keymap"
import { Toast } from "@tui/ui/toast"
import { ClawChat } from "./chat"
import { ClawSidebar } from "./sidebar"
import { createClawStatus, createClawChat } from "./hooks"
import { DialogConversationList } from "./dialog-conversation-list"
import type { ClawSlashOption } from "./autocomplete"

export function kodaClawView() {
  const route = useRoute()
  const sdk = useSDK()
  const dialog = useDialog()

  // Poll instance status
  const { status, error: statusError, loading: statusLoading } = createClawStatus(sdk)

  // Connect to chat
  const chat = createClawChat(sdk)

  // Determine if chat input should be disabled
  const disabled = createMemo(() => {
    const s = status()
    return !s || s.status !== "running"
  })

  // Bot display name — sourced from the kodaClaw platform status (set by the
  // user during onboarding via patchBotIdentity). Falls back to the literal
  // "kodaClaw" while loading or for instances that skipped onboarding,
  // matching the web UI's fallback chain.
  const botName = createMemo(() => status()?.botName ?? "kodaClaw")

  // kodaClaw view commands — single source of truth for both the global
  // command palette / keybinds and the in-chat slash autocomplete.
  // The list is reactive on `chat.connected` so the slash menu only
  // exposes `/new` and `/conversations` once we're connected to koda-chat.
  const kodaCommands = createMemo(() => {
    const ready = chat.connected()
    return [
      {
        name: "kodaclaw.back",
        title: "Back",
        desc: "Return to the previous view",
        category: "kodaClaw",
        namespace: "palette",
        slashName: "back",
        slashAliases: [] as string[],
        enabled: true,
        hidden: false,
        run: () => {
          dialog.clear()
          route.back()
        },
      },
      {
        name: "kodaclaw.new",
        title: "New conversation",
        desc: "Start a new kodaClaw conversation",
        category: "kodaClaw",
        namespace: "palette",
        slashName: "new",
        slashAliases: [] as string[],
        enabled: ready,
        hidden: !ready,
        run: async () => {
          dialog.clear()
          await chat.newConversation()
        },
      },
      {
        name: "kodaclaw.conversations",
        title: "Conversations",
        desc: "Browse, rename, and delete kodaClaw conversations",
        category: "kodaClaw",
        namespace: "palette",
        slashName: "conversations",
        slashAliases: ["chats"],
        enabled: ready,
        hidden: !ready,
        run: () => {
          dialog.replace(() => <DialogConversationList chat={chat} />)
        },
      },
    ]
  })

  useBindings(() => ({
    commands: kodaCommands(),
    bindings: [{ key: "escape", cmd: "kodaclaw.back" }],
  }))

  // Slashes for the in-chat autocomplete — derived from the same list so
  // renames flow through automatically. We pad displays to a common width
  // so the descriptions line up like in the main prompt's autocomplete.
  const clawSlashes = createMemo<ClawSlashOption[]>(() => {
    const visible = kodaCommands().filter((c) => c.enabled !== false && !c.hidden && c.slashName)
    const items = visible.map((c) => ({
      display: "/" + c.slashName,
      description: c.desc ?? c.title,
      aliases: c.slashAliases?.map((alias) => "/" + alias),
      onSelect: () => c.run(),
    }))
    const max = items.reduce((m, i) => Math.max(m, i.display.length), 0)
    if (!max) return items
    return items.map((i) => ({ ...i, display: i.display.padEnd(max + 2) }))
  })

  return (
    <box flexDirection="row" flexGrow={1} paddingLeft={2} gap={1}>
      <box flexGrow={1} flexDirection="column">
        <ClawChat
          messages={chat.messages()}
          online={chat.online()}
          connected={chat.connected()}
          loading={chat.loading()}
          error={chat.error()}
          disabled={disabled()}
          typingMembers={chat.typingMembers()}
          slashes={clawSlashes}
          botName={botName()}
          onSend={chat.send}
        />
        <Toast />
      </box>
      <ClawSidebar
        status={status()}
        loading={statusLoading()}
        error={statusError()}
        online={chat.online()}
        connected={chat.connected()}
        chatLoading={chat.loading()}
        chatError={chat.error()}
        conversations={chat.conversations()}
        activeConversationId={chat.activeConversationId()}
        conversationStatus={chat.conversationStatus()}
      />
    </box>
  )
}
