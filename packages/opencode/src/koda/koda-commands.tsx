/**
 * koda Gateway Commands for TUI
 *
 * Provides /profile and /teams commands that are only visible when connected to koda Gateway.
 */

import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useBindings } from "@tui/keymap"
import { useSync } from "@tui/context/sync"
import { useRoute } from "@tui/context/route"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { reconcile } from "solid-js/store"
import type { Organization } from "@koda/koda-gateway"
import type { ClawStatus } from "./claw/types.js"
import { DialogkodaTeamSelect } from "./components/dialog-koda-team-select.js"
import { DialogkodaProfile } from "./components/dialog-koda-profile.js"
import { DialogClawSetup } from "./components/dialog-claw-setup.js"
import { DialogClawUpgrade } from "./components/dialog-claw-upgrade.js"
import { DialogIndexing } from "./components/dialog-indexing.js"
import { DialogProviderUsage } from "./components/dialog-provider-usage.js"
import { indexingEnabled } from "./indexing-feature"
import { refreshBalance } from "./balance-refresh"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"

// Koda-specific workspace routes are intentionally kept behind this small adapter until
// the generated SDK includes the newest Koda extension group. It still reuses the TUI
// SDK transport, directory scoping, auth headers, and error handling.
async function kodaWorkspaceRequest<T>(sdk: any, path: string, init?: RequestInit): Promise<T> {
  const url = new URL(path, sdk.url)
  if (sdk.directory) url.searchParams.set("directory", sdk.directory)
  const response = await sdk.fetch(
    new Request(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    }),
  )
  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : response.statusText
    throw new Error(message || `Request failed (${response.status})`)
  }
  return body as T
}

type CollaborationSummary = {
  id: string
  mode: string
  state: string
  revision: number
  total: number
  counts: Record<string, number>
  nodes: Array<{ id: string; role: string; state: string; attempts: number; error?: string }>
}

function collaborationConfig(sync: any) {
  return (sync.data.config.collaboration ?? {}) as Record<string, unknown>
}

function hooksConfig(sync: any) {
  return (sync.data.config.hooks ?? {}) as Record<string, unknown>
}

function CollaborationDashboard(props: { sdk: any; dialog: any; toast: any }) {
  const [graphs, setGraphs] = createSignal<CollaborationSummary[]>([])
  const [loading, setLoading] = createSignal(true)

  const refresh = async () => {
    try {
      setGraphs(await kodaWorkspaceRequest<CollaborationSummary[]>(props.sdk, "/koda/collaboration"))
    } catch (error) {
      props.toast.show({ variant: "error", message: `Collaboration status failed: ${String(error)}` })
    } finally {
      setLoading(false)
    }
  }

  const cancel = async (graphID: string) => {
    try {
      await kodaWorkspaceRequest(props.sdk, `/koda/collaboration/${encodeURIComponent(graphID)}/cancel`, {
        method: "POST",
      })
      props.toast.show({ variant: "success", message: "Collaboration graph cancelled" })
      await refresh()
    } catch (error) {
      props.toast.show({ variant: "error", message: `Cancel failed: ${String(error)}` })
    }
  }

  const recover = async () => {
    try {
      const recovered = await kodaWorkspaceRequest<CollaborationSummary[]>(props.sdk, "/koda/collaboration/recover", {
        method: "POST",
      })
      props.toast.show({ variant: "success", message: `Recovered ${recovered.length} collaboration graph(s)` })
      await refresh()
    } catch (error) {
      props.toast.show({ variant: "error", message: `Recovery failed: ${String(error)}` })
    }
  }

  onMount(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 1500)
    onCleanup(() => clearInterval(timer))
  })

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    graphs().map((graph) => ({
      title: `${graph.mode} · ${graph.state} · ${graph.id}`,
      value: graph.id,
      description: `${graph.total} nodes · revision ${graph.revision}`,
      details: Object.entries(graph.counts)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${state}: ${count}`),
    })),
  )

  return (
    <DialogSelect
      title={loading() ? "Collaboration graphs (loading…)" : "Collaboration graphs"}
      options={options()}
      skipFilter={options().length === 0}
      emptyView={<text fg="gray">No durable collaboration graphs for this workspace.</text>}
      onSelect={(option) => {
        const graph = graphs().find((item) => item.id === option.value)
        if (!graph) return
        props.dialog.replace(() => (
          <DialogAlert
            title={`Collaboration · ${graph.mode} · ${graph.state}`}
            message={[
              `Graph: ${graph.id}`,
              `Revision: ${graph.revision}`,
              `Nodes: ${graph.total}`,
              ...graph.nodes.map(
                (node) =>
                  `${node.state.padEnd(10)} ${node.role} (${node.attempts} attempt(s))${node.error ? ` — ${node.error}` : ""}`,
              ),
            ].join("\n")}
          />
        ))
      }}
      actions={[
        { command: "koda.collaboration.refresh", title: "refresh", requiresSelection: false, onTrigger: refresh },
        { command: "koda.collaboration.recover", title: "recover", requiresSelection: false, onTrigger: recover },
        {
          command: "koda.collaboration.cancel",
          title: "cancel",
          onTrigger: (option) => {
            if (option) void cancel(option.value)
          },
        },
      ]}
      bindings={[
        { key: "ctrl+r", cmd: "koda.collaboration.refresh" },
        { key: "ctrl+shift+r", cmd: "koda.collaboration.recover" },
        { key: "ctrl+x", cmd: "koda.collaboration.cancel" },
        { key: "left", cmd: "dialog.select.prev" },
        { key: "right", cmd: "dialog.select.next" },
      ]}
    />
  )
}

type CollaborationMenuAction =
  | "dashboard"
  | "mode"
  | "toggle-collaboration"
  | "recover"
  | "cancel"
  | "hooks"
  | "toggle-hooks"

function CollaborationModeSelect(props: { sync: any; dialog: any; toast: any; sdk: any }) {
  const current = collaborationConfig(props.sync)
  return (
    <DialogSelect
      title="Koda collaboration mode"
      current={current.mode as string | undefined}
      options={(["focused", "parallel", "review", "thorough"] as const).map((mode) => ({
        title: mode,
        value: mode,
        description:
          mode === "focused"
            ? "Scout → build → verify"
            : mode === "parallel"
              ? "Parallel discovery and risk analysis"
              : mode === "review"
                ? "Correctness, security, and quality audit"
                : "Architecture → parallel work → verification → review",
      }))}
      bindings={[
        { key: "left", cmd: "dialog.select.prev" },
        { key: "right", cmd: "dialog.select.next" },
      ]}
      onSelect={async (option) => {
        const result = await props.sdk.client.config.overlayUpdate({
          scope: "project",
          set: { collaboration: { ...current, enabled: true, mode: option.value } },
        })
        if (result.error) {
          props.toast.show({ variant: "error", message: "Failed to set collaboration mode" })
          return
        }
        await props.sync.bootstrap().catch(() => {})
        props.toast.show({ variant: "success", message: `Collaboration mode: ${option.value}` })
        props.dialog.replace(() => <CollaborationMenu {...props} />)
      }}
    />
  )
}

function CollaborationCancelSelect(props: { sdk: any; dialog: any; toast: any }) {
  const [graphs, setGraphs] = createSignal<CollaborationSummary[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(() => {
    void kodaWorkspaceRequest<CollaborationSummary[]>(props.sdk, "/koda/collaboration")
      .then(setGraphs)
      .catch((error) => props.toast.show({ variant: "error", message: `Graph list failed: ${String(error)}` }))
      .finally(() => setLoading(false))
  })

  return (
    <DialogSelect
      title={loading() ? "Select graph to cancel (loading…)" : "Select graph to cancel"}
      options={graphs()
        .filter((graph) => graph.state === "planning" || graph.state === "running")
        .map((graph) => ({
          title: `${graph.mode} · ${graph.state} · ${graph.id}`,
          value: graph.id,
          description: `${graph.total} nodes · revision ${graph.revision}`,
        }))}
      emptyView={<text fg="gray">No active collaboration graphs.</text>}
      skipFilter={graphs().length === 0}
      bindings={[
        { key: "left", cmd: "dialog.select.prev" },
        { key: "right", cmd: "dialog.select.next" },
      ]}
      onSelect={async (option) => {
        try {
          await kodaWorkspaceRequest(props.sdk, `/koda/collaboration/${encodeURIComponent(option.value)}/cancel`, {
            method: "POST",
          })
          props.toast.show({ variant: "success", message: "Collaboration graph cancelled" })
          props.dialog.replace(() => <CollaborationMenu {...props} />)
        } catch (error) {
          props.toast.show({ variant: "error", message: `Cancel failed: ${String(error)}` })
        }
      }}
    />
  )
}

function CollaborationMenu(props: { sync: any; dialog: any; toast: any; sdk: any }) {
  const collaboration = collaborationConfig(props.sync)
  const hooks = hooksConfig(props.sync)
  const collaborationEnabled = collaboration.enabled === true
  const hooksEnabled = hooks.enabled === true
  const options: DialogSelectOption<CollaborationMenuAction>[] = [
    {
      title: "Open collaboration dashboard",
      value: "dashboard",
      description: "Inspect live durable graphs, node progress, retries, and errors",
    },
    {
      title: "Choose collaboration mode",
      value: "mode",
      description: `Current: ${String(collaboration.mode ?? "focused")} · selecting a mode enables collaboration`,
    },
    {
      title: collaborationEnabled ? "Disable collaboration" : "Enable collaboration",
      value: "toggle-collaboration",
      description: collaborationEnabled
        ? "Stop new proactive graph runs and preserve existing history"
        : "Allow the model-visible collaborate tool to create graphs",
    },
    {
      title: "Recover interrupted graphs",
      value: "recover",
      description: "Requeue durable planning/running nodes after an interrupted session",
    },
    {
      title: "Cancel an active graph",
      value: "cancel",
      description: "Select an active graph and stop its child sessions",
    },
    {
      title: "Inspect lifecycle hooks",
      value: "hooks",
      description: "Show sanitized hook metadata without command bodies or environment values",
    },
    {
      title: hooksEnabled ? "Disable lifecycle hooks" : "Enable lifecycle hooks",
      value: "toggle-hooks",
      description: hooksEnabled
        ? "Turn off configured lifecycle observers and gates"
        : "Turn on configured lifecycle observers",
    },
  ]

  const returnToMenu = () => props.dialog.replace(() => <CollaborationMenu {...props} />)

  const run = async (action: CollaborationMenuAction) => {
    if (action === "dashboard") {
      props.dialog.replace(() => <CollaborationDashboard sdk={props.sdk} dialog={props.dialog} toast={props.toast} />)
      return
    }
    if (action === "mode") {
      props.dialog.replace(() => <CollaborationModeSelect {...props} />)
      return
    }
    if (action === "cancel") {
      props.dialog.replace(() => (
        <CollaborationCancelSelect sdk={props.sdk} dialog={props.dialog} toast={props.toast} />
      ))
      return
    }
    if (action === "recover") {
      try {
        const recovered = await kodaWorkspaceRequest<CollaborationSummary[]>(props.sdk, "/koda/collaboration/recover", {
          method: "POST",
        })
        props.toast.show({ variant: "success", message: `Recovered ${recovered.length} collaboration graph(s)` })
      } catch (error) {
        props.toast.show({ variant: "error", message: `Recovery failed: ${String(error)}` })
      }
      returnToMenu()
      return
    }
    if (action === "hooks") {
      try {
        const hooksList = await kodaWorkspaceRequest<any[]>(props.sdk, "/koda/hooks")
        props.dialog.replace(() => (
          <DialogAlert
            title="Koda lifecycle hooks"
            message={
              hooksList.length === 0
                ? "No lifecycle hooks configured."
                : hooksList
                    .map((hook) => `${hook.enabled ? "on " : "off"} ${hook.id} · ${hook.mode} · ${hook.onError}`)
                    .join("\\n")
            }
          />
        ))
      } catch (error) {
        props.toast.show({ variant: "error", message: `Hook inspection failed: ${String(error)}` })
      }
      return
    }
    if (action === "toggle-collaboration") {
      const next = { ...collaboration, enabled: !collaborationEnabled, mode: collaboration.mode ?? "focused" }
      const result = await props.sdk.client.config.overlayUpdate({ scope: "project", set: { collaboration: next } })
      if (result.error) props.toast.show({ variant: "error", message: "Failed to update collaboration" })
      else {
        await props.sync.bootstrap().catch(() => {})
        props.toast.show({ variant: "success", message: `Collaboration ${next.enabled ? "enabled" : "disabled"}` })
      }
      returnToMenu()
      return
    }
    const next = { ...hooks, enabled: !hooksEnabled }
    const result = await props.sdk.client.config.overlayUpdate({ scope: "project", set: { hooks: next } })
    if (result.error) props.toast.show({ variant: "error", message: "Failed to update lifecycle hooks" })
    else {
      await props.sync.bootstrap().catch(() => {})
      props.toast.show({ variant: "success", message: `Lifecycle hooks ${next.enabled ? "enabled" : "disabled"}` })
    }
    returnToMenu()
  }

  return (
    <DialogSelect
      title="Koda collaboration"
      placeholder="Filter collaboration actions"
      options={options}
      skipFilter={false}
      footerHints={[
        { title: "navigate", label: "↑↓ / ←→", side: "left" },
        { title: "select", label: "enter", side: "right" },
      ]}
      bindings={[
        { key: "left", cmd: "dialog.select.prev" },
        { key: "right", cmd: "dialog.select.next" },
      ]}
      onSelect={(option) => void run(option.value)}
    />
  )
}

// These types are OpenCode-internal and imported at runtime
type UseSDK = any
type SDK = any

/**
 * Register all koda Gateway commands
 * Call this from a component inside the TUI app
 *
 * @param useSDK - OpenCode's useSDK hook (passed from TUI context)
 */
export function registerkodaCommands(useSDK: () => UseSDK) {
  const sync = useSync()
  const route = useRoute()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()

  // Only show koda commands when connected to koda Gateway
  const iskodaConnected = createMemo(() => {
    return sync.data.provider_next.connected.includes("koda")
  })
  const indexing = createMemo(() => indexingEnabled(sync.data.config))

  useBindings(() => ({
    commands: [
      {
        name: "koda.collaboration.menu",
        title: "Collaboration controls",
        desc: "Open one menu for collaboration modes, graphs, recovery, cancellation, and lifecycle hooks",
        category: "koda",
        slashName: "collaboration",
        slashAliases: ["collab"],
        run: () => dialog.replace(() => <CollaborationMenu sync={sync} dialog={dialog} toast={toast} sdk={sdk} />),
      },

      // /kodaclaw command
      {
        name: "koda.claw",
        title: "kodaClaw",
        desc: "Open kodaClaw chat & dashboard",
        category: "koda",
        slashName: "kodaclaw",
        slashAliases: ["claw"],
        enabled: iskodaConnected(),
        hidden: !iskodaConnected(),
        run: async () => {
          // Fetch profile (for org context) and instance status in parallel
          const [profileRes, res] = await Promise.all([
            sdk.client.koda.profile().catch(() => null),
            sdk.client.koda.claw.status().catch(() => null),
          ])
          const orgId = profileRes?.data?.currentOrgId ?? null
          const status = res?.data as ClawStatus | undefined

          // No instance provisioned
          if (!status || !status.userId || res.error) {
            dialog.replace(() => <DialogClawSetup orgId={orgId} />)
            return
          }

          // Instance exists — check for chat credentials
          const creds = await sdk.client.koda.claw.chatCredentials().catch(() => null)

          if (!creds?.data || creds.error) {
            // Instance exists but no chat credentials — needs upgrade
            dialog.replace(() => <DialogClawUpgrade orgId={orgId} />)
            return
          }

          // Everything ready — navigate to full-screen chat view
          route.navigate({ type: "kodaclaw" })
          dialog.clear()
        },
      },

      // /remote command
      {
        name: "remote.toggle",
        title: "Toggle remote",
        desc: "Enable or disable remote session relay",
        category: "koda",
        slashName: "remote",
        enabled: iskodaConnected(),
        hidden: !iskodaConnected(),
        run: async () => {
          try {
            const current = await sdk.client.remote.status()

            if (current.error || !current.data) {
              dialog.replace(() => <DialogAlert title="Error" message="Failed to fetch remote status." />)
              return
            }

            if (current.data.enabled) {
              await sdk.client.remote.disable()
              toast.show({ message: "Remote disabled", variant: "success" })
            } else {
              const result = await sdk.client.remote.enable()
              if (result.error) {
                const err = result.error as { error?: string }
                const msg = err?.error ?? "Failed to enable remote."
                dialog.replace(() => <DialogAlert title="Error" message={msg} />)
                return
              }
              toast.show({ message: "Remote enabled", variant: "success" })
            }

            dialog.clear()
          } catch (error) {
            dialog.replace(() => <DialogAlert title="Error" message={`Failed to toggle remote: ${error}`} />)
          }
        },
      },

      {
        name: "koda.usage",
        title: "Plans & usage",
        desc: "View provider plans and quota",
        category: "koda",
        slashName: "usage",
        slashAliases: ["plans", "quota"],
        run: () => {
          dialog.replace(() => <DialogProviderUsage />)
        },
      },

      // /profile command
      {
        name: "koda.profile",
        title: "Profile",
        desc: "View your koda Gateway profile",
        category: "koda",
        slashName: "profile",
        slashAliases: ["me", "whoami"],
        enabled: iskodaConnected(),
        hidden: !iskodaConnected(),
        run: async () => {
          try {
            if (sync.data.config.privacy_mode === true || sync.data.globalConfig.privacy_mode === true) {
              const confirmed = await DialogConfirm.show(
                dialog,
                "Privacy Mode Enabled",
                "Privacy mode is on. Revealing your profile will display your email, name, balance, and team on screen.",
              )
              if (confirmed !== true) return
            }

            // Fetch profile and balance using server endpoint
            const response = await sdk.client.koda.profile()

            if (response.error || !response.data) {
              dialog.replace(() => (
                <DialogAlert
                  title="Error"
                  message="Failed to fetch profile. Please ensure you're authenticated with koda Gateway."
                />
              ))
              return
            }

            const { profile, balance, currentOrgId } = response.data

            // Show profile dialog with clickable usage link
            dialog.replace(() => <DialogkodaProfile profile={profile} balance={balance} currentOrgId={currentOrgId} />)
          } catch (error) {
            dialog.replace(() => <DialogAlert title="Error" message={`Failed to fetch profile: ${error}`} />)
          }
        },
      },

      ...(indexing()
        ? [
            {
              name: "koda.indexing",
              title: "Indexing",
              desc: "Configure codebase indexing",
              category: "koda",
              slashName: "indexing",
              slashAliases: ["index", "embedding"],
              run: () => {
                dialog.replace(() => <DialogIndexing useSDK={useSDK} />)
              },
            },
          ]
        : []),

      // /privacy command
      {
        name: "koda.privacy",
        get title() {
          const active = sync.data.config.privacy_mode === true || sync.data.globalConfig.privacy_mode === true
          return active ? "Disable privacy mode" : "Enable privacy mode"
        },
        desc: "Blur PII (balance, email, etc.) and confirm before showing profile",
        category: "koda",
        slashName: "privacy",
        run: async () => {
          const active = sync.data.config.privacy_mode === true || sync.data.globalConfig.privacy_mode === true
          const next = !active
          const updates = [
            sdk.client.config.overlayUpdate({
              scope: "global",
              set: { privacy_mode: next },
            }),
          ]
          if (!next && sync.data.config.privacy_mode === true) {
            updates.push(
              sdk.client.config.overlayUpdate({
                scope: "project",
                unset: [["privacy_mode"]],
              }),
            )
          }
          const responses = await Promise.all(updates)
          const failed = responses.find((r) => r.error)
          if (failed) {
            const status = failed.response?.status ?? "?"
            toast.show({ message: `Failed to update privacy mode (${status})`, variant: "error" })
            return
          }
          const [cfg, global] = await Promise.all([sdk.client.config.get({}), sdk.client.global.config.get({})])
          if (cfg.data) sync.set("config", reconcile(cfg.data))
          if (global.data) sync.set("globalConfig", reconcile(global.data))
          toast.show({
            message: next ? "Privacy mode enabled" : "Privacy mode disabled",
            variant: "success",
          })
        },
      },

      // /teams command
      {
        name: "koda.teams",
        title: "Teams",
        desc: "Switch between koda Gateway teams",
        category: "koda",
        slashName: "teams",
        slashAliases: ["team", "org", "orgs"],
        enabled: iskodaConnected(),
        hidden: !iskodaConnected(),
        run: async () => {
          try {
            // Fetch profile to get organizations
            const response = await sdk.client.koda.profile()

            if (response.error || !response.data) {
              dialog.replace(() => (
                <DialogAlert
                  title="Error"
                  message="Failed to fetch teams. Please ensure you're authenticated with koda Gateway."
                />
              ))
              return
            }

            const { profile, currentOrgId } = response.data

            if (!profile.organizations || profile.organizations.length === 0) {
              dialog.replace(() => (
                <DialogAlert
                  title="No Teams Available"
                  message="You're not a member of any teams.\nVisit https://app.koda.ai to create or join a team."
                />
              ))
              return
            }

            // Show team selection dialog
            dialog.replace(() => (
              <DialogkodaTeamSelect
                organizations={profile.organizations!}
                currentOrgId={currentOrgId}
                hasPersonalAccount={profile.hasPersonalAccount !== false}
                onSelect={async (orgId) => {
                  try {
                    // Switch to team immediately using server endpoint
                    const result = await sdk.client.koda.organization.set({
                      organizationId: orgId,
                    })
                    if (result.error) {
                      toast.show({
                        message: "Failed to switch team",
                        variant: "error",
                      })
                      dialog.clear()
                      return
                    }

                    // Refresh provider state to reload models with new organization context
                    await sdk.client.instance.dispose()
                    await sync.bootstrap()

                    // Update the sidebar balance immediately for the newly selected account
                    refreshBalance()

                    // Show success toast
                    const teamName = orgId
                      ? profile.organizations!.find((o: Organization) => o.id === orgId)?.name
                      : "Personal"

                    toast.show({
                      message: `Switched to: ${teamName}`,
                      variant: "success",
                    })

                    // Close dialog
                    dialog.clear()
                  } catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") return
                    toast.show({
                      message: "Failed to switch team",
                      variant: "error",
                    })
                    dialog.clear()
                  }
                }}
              />
            ))
          } catch (error) {
            dialog.replace(() => <DialogAlert title="Error" message={`Failed to fetch teams: ${error}`} />)
          }
        },
      },
    ].map((command) => ({
      namespace: "palette",
      ...command,
    })),
  }))
}
