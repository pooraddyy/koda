import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "../context/sync"
import { map, pipe, sortBy } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { DialogPrompt } from "../ui/dialog-prompt"
import { Link } from "../ui/link"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import type { ProviderAuthAuthorization, ProviderAuthMethod } from "@koda/sdk/v2"
import { DialogModel } from "./dialog-model"
import { useToast } from "../ui/toast"
import { isConsoleManagedProvider } from "../util/provider-origin"
import * as kodaProvider from "@/koda/cli/cmd/tui/component/dialog-provider" // koda_change
import { useConnected } from "./use-connected"
import { useBindings } from "../keymap"
import { errorMessage } from "@/util/error" // koda_change
import { useClipboard } from "../context/clipboard"

const PROVIDER_PRIORITY: Record<string, number> = kodaProvider.PROVIDER_PRIORITY // koda_change

const CUSTOM_PROVIDER_OPTION_VALUE = "__opencode_custom_provider__"
const CUSTOM_PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
export const CUSTOM_PROVIDER_CONFIG_SCOPE = "global" as const

type ProviderOptionBase = {
  title: string
  value: string
  description?: string
  category: string
}

type ProviderOption =
  | (ProviderOptionBase & {
      type: "provider"
      providerID: string
    })
  | (ProviderOptionBase & {
      type: "custom"
    })

export function providerOptions(list: { id: string; name: string }[]): ProviderOption[] {
  return [
    ...pipe(
      list,
      sortBy(
        (x) => PROVIDER_PRIORITY[x.id] ?? 99,
        (x) => x.name.toLowerCase(),
        (x) => x.id,
      ),
      map((provider) => ({
        type: "provider" as const,
        title: provider.name,
        value: provider.id,
        providerID: provider.id,
        description: kodaProvider.PROVIDER_DESCRIPTIONS[provider.id], // koda_change
        category: provider.id in PROVIDER_PRIORITY ? "Popular" : "Providers",
      })),
    ),
    {
      type: "custom",
      title: "Other",
      value: CUSTOM_PROVIDER_OPTION_VALUE,
      description: "Custom provider",
      category: "Providers",
    },
  ]
}

export function normalizeCustomProviderID(value: string) {
  const providerID = value.trim().replace(/^@ai-sdk\//, "")
  if (!CUSTOM_PROVIDER_ID.test(providerID)) return
  return providerID
}

export function normalizeCustomProviderName(value: string) {
  const name = value.trim()
  if (!name || name.length > 120) return
  return name
}

export function normalizeCustomModelID(value: string) {
  const modelID = value.trim()
  if (!modelID || modelID.length > 200 || /\s/.test(modelID)) return
  return modelID
}

export function normalizeCustomBaseURL(value: string) {
  const raw = value.trim()
  if (!raw || raw.length > 2000) return
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return
    if (url.username || url.password) return
    url.hash = ""
    url.search = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return
  }
}

export function buildCustomProviderConfig(input: {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
  baseURL: string
}) {
  return {
    [input.providerID]: {
      name: input.providerName,
      api: input.baseURL,
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: input.baseURL },
      models: {
        [input.modelID]: {
          id: input.modelID,
          name: input.modelName,
        },
      },
    },
  }
}

type CustomProviderSetup = {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
  baseURL: string
}

export function createDialogProviderOptions() {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()
  const onboarded = useConnected()

  async function promptCustomProviderSetup(): Promise<CustomProviderSetup | undefined> {
    const providerNameValue = await DialogPrompt.show(dialog, "Other · provider name", {
      placeholder: "Example: Acme AI",
      description: () => <text fg={theme.textMuted}>This name appears in Koda’s model picker.</text>,
    })
    if (providerNameValue === null) return
    const providerName = normalizeCustomProviderName(providerNameValue)
    if (!providerName) {
      toast.show({ variant: "error", message: "Enter a provider name between 1 and 120 characters." })
      return promptCustomProviderSetup()
    }

    const suggestedID = providerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64)
    const providerIDValue = await DialogPrompt.show(dialog, "Other · provider id", {
      value: suggestedID,
      placeholder: "lowercase-provider-id",
      description: () => (
        <text fg={theme.textMuted}>Used internally for provider/model selection. You can keep the suggested ID.</text>
      ),
    })
    if (providerIDValue === null) return
    const providerID = normalizeCustomProviderID(providerIDValue)
    if (!providerID) {
      toast.show({
        variant: "error",
        message:
          "Provider IDs must start with a lowercase letter or number and only use lowercase letters, numbers, hyphens, and underscores.",
      })
      return promptCustomProviderSetup()
    }

    const modelIDValue = await DialogPrompt.show(dialog, "Other · model id", {
      placeholder: "Example: llama-3.3-70b-instruct",
      description: () => <text fg={theme.textMuted}>Enter the model ID expected by the provider API.</text>,
    })
    if (modelIDValue === null) return
    const modelID = normalizeCustomModelID(modelIDValue)
    if (!modelID) {
      toast.show({ variant: "error", message: "Model IDs are required and cannot contain spaces." })
      return promptCustomProviderSetup()
    }

    const modelNameValue = await DialogPrompt.show(dialog, "Other · model name", {
      value: modelID,
      placeholder: "Display name",
      description: () => <text fg={theme.textMuted}>This friendly name appears in the model picker.</text>,
    })
    if (modelNameValue === null) return
    const modelName = normalizeCustomProviderName(modelNameValue)
    if (!modelName) {
      toast.show({ variant: "error", message: "Enter a model name between 1 and 120 characters." })
      return promptCustomProviderSetup()
    }

    const baseURLValue = await DialogPrompt.show(dialog, "Other · base API URL", {
      placeholder: "https://api.example.com/v1",
      description: () => (
        <text fg={theme.textMuted}>OpenAI-compatible API endpoint. Do not include an API key in the URL.</text>
      ),
    })
    if (baseURLValue === null) return
    const baseURL = normalizeCustomBaseURL(baseURLValue)
    if (!baseURL) {
      toast.show({ variant: "error", message: "Enter a valid http:// or https:// base API URL." })
      return promptCustomProviderSetup()
    }

    return {
      providerID,
      providerName,
      modelID,
      modelName,
      baseURL,
    }
  }

  const options = createMemo(() => {
    return pipe(
      providerOptions(sync.data.provider_next.all),
      map((provider) => {
        if (provider.type === "custom") {
          return {
            title: provider.title,
            value: provider.value,
            description: provider.description,
            category: provider.category,
            async onSelect() {
              const setup = await promptCustomProviderSetup()
              if (!setup) return
              return dialog.replace(() => <CustomProviderMethod setup={setup} />)
            },
          }
        }

        const providerID = provider.providerID
        const consoleManaged = isConsoleManagedProvider(sync.data.console_state.consoleManagedProviders, providerID)
        const connected = sync.data.provider_next.connected.includes(providerID)
        // koda_change start
        const failed = sync.data.provider_next.failed ?? []
        const failedGutter = kodaProvider.renderGutter(providerID, failed, theme)
        const failedDesc = kodaProvider.failedDescription(providerID, failed)
        const baseDesc = kodaProvider.PROVIDER_DESCRIPTIONS[providerID]
        // koda_change end

        return {
          title: kodaProvider.PROVIDER_TITLES[providerID] ?? provider.title, // koda_change
          value: provider.value,
          description: failedDesc ?? baseDesc ?? provider.description, // koda_change
          footer: consoleManaged ? sync.data.console_state.activeOrgName : undefined,
          category: provider.category,
          gutter: failedGutter ?? (connected && onboarded() ? () => <text fg={theme.success}>✓</text> : undefined), // koda_change
          async onSelect() {
            if (consoleManaged) return
            if (kodaProvider.selectProvider({ providerID, replace: dialog.replace, model: DialogModel })) return // koda_change

            const methods = sync.data.provider_auth[providerID] ?? [
              {
                type: "api",
                label: "API key",
              },
            ]
            let index: number | null = 0
            if (methods.length > 1) {
              index = await new Promise<number | null>((resolve) => {
                dialog.replace(
                  () => (
                    <DialogSelect
                      title="Select auth method"
                      options={methods.map((x, index) => ({
                        title: x.label,
                        value: index,
                      }))}
                      onSelect={(option) => resolve(option.value)}
                    />
                  ),
                  () => resolve(null),
                )
              })
            }
            if (index == null) return
            const method = methods[index]
            if (method.type === "oauth") {
              let inputs: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({
                  dialog,
                  prompts: method.prompts,
                })
                if (!value) return
                inputs = value
              }

              const result = await sdk.client.provider.oauth.authorize({
                providerID,
                method: index,
                inputs,
              })
              if (result.error) {
                toast.show({
                  variant: "error",
                  message: errorMessage(result.error), // koda_change
                })
                dialog.clear()
                return
              }
              if (result.data?.method === "code") {
                dialog.replace(() => (
                  <CodeMethod providerID={providerID} title={method.label} index={index} authorization={result.data!} />
                ))
              }
              if (result.data?.method === "auto") {
                // koda_change start
                const koda = kodaProvider.renderAutoMethod({
                  providerID,
                  title: method.label,
                  index,
                  authorization: result.data!,
                  useSDK,
                  useTheme,
                  DialogModel,
                })
                if (koda) {
                  dialog.replace(koda)
                } else {
                  // koda_change end
                  dialog.replace(() => (
                    <AutoMethod
                      providerID={providerID}
                      title={method.label}
                      index={index}
                      authorization={result.data!}
                    />
                  ))
                } // koda_change
              }
            }
            if (method.type === "api") {
              let metadata: Record<string, string> | undefined
              if (method.prompts?.length) {
                const value = await PromptsMethod({ dialog, prompts: method.prompts })
                if (!value) return
                metadata = value
              }
              return dialog.replace(() => (
                <ApiMethod providerID={providerID} title={method.label} metadata={metadata} />
              ))
            }
          },
        }
      }),
    )
  })
  return options
}

export function DialogProvider() {
  const options = createDialogProviderOptions()
  return <DialogSelect title="Connect a provider" options={options()} />
}

interface AutoMethodProps {
  index: number
  providerID: string
  title: string
  authorization: ProviderAuthAuthorization
}
function AutoMethod(props: AutoMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const dialog = useDialog()
  const sync = useSync()
  const toast = useToast()
  const clipboard = useClipboard()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Copy provider code",
        group: "Dialog",
        cmd: () => {
          const code =
            props.authorization.instructions.match(/[A-Z0-9]{4}-[A-Z0-9]{4,5}/)?.[0] ?? props.authorization.url
          clipboard
            .write?.(code)
            .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
            .catch(toast.error)
        },
      },
    ],
  }))

  onMount(async () => {
    const result = await sdk.client.provider.oauth.callback({
      providerID: props.providerID,
      method: props.index,
    })
    if (result.error) {
      toast.show({
        variant: "error",
        message:
          "name" in result.error && result.error.name === "ProviderAuthOauthCallbackFailed"
            ? "OAuth authorization failed. Try /connect again."
            : JSON.stringify(result.error),
      })
      dialog.clear()
      return
    }
    await sdk.client.instance.dispose()
    await sync.bootstrap()
    dialog.replace(() => <DialogModel providerID={props.providerID} />)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <Link href={props.authorization.url} fg={theme.primary} />
        <text fg={theme.textMuted}>{props.authorization.instructions}</text>
      </box>
      <text fg={theme.textMuted}>Waiting for authorization...</text>
      <text fg={theme.text}>
        c <span style={{ fg: theme.textMuted }}>copy</span>
      </text>
    </box>
  )
}

interface CodeMethodProps {
  index: number
  title: string
  providerID: string
  authorization: ProviderAuthAuthorization
}
function CodeMethod(props: CodeMethodProps) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const [error, setError] = createSignal(false)

  return (
    <DialogPrompt
      title={props.title}
      placeholder="Authorization code"
      onConfirm={async (value) => {
        const { error } = await sdk.client.provider.oauth.callback({
          providerID: props.providerID,
          method: props.index,
          code: value,
        })
        if (!error) {
          await sdk.client.instance.dispose()
          await sync.bootstrap()
          dialog.replace(() => <DialogModel providerID={props.providerID} />)
          return
        }
        setError(true)
      }}
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>{props.authorization.instructions}</text>
          <Link href={props.authorization.url} fg={theme.primary} />
          <Show when={error()}>
            <text fg={theme.error}>Invalid code</text>
          </Show>
        </box>
      )}
    />
  )
}

function CustomProviderMethod(props: { setup: CustomProviderSetup }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()
  const [busy, setBusy] = createSignal(false)

  return (
    <DialogPrompt
      title={`Connect ${props.setup.providerName}`}
      placeholder="Optional API key · leave blank for local providers"
      busy={busy()}
      busyText="Saving provider configuration..."
      description={() => (
        <box gap={1}>
          <text fg={theme.textMuted}>
            {props.setup.modelName} · {props.setup.modelID}
          </text>
          <text fg={theme.textMuted}>{props.setup.baseURL}</text>
          <text fg={theme.textMuted}>Leave the key empty when the endpoint does not require authentication.</text>
        </box>
      )}
      onConfirm={async (value) => {
        if (busy()) return
        setBusy(true)
        try {
          const config = buildCustomProviderConfig(props.setup)
          // Custom providers are user-level integrations, not project-only settings.
          // Persist the complete provider/model definition globally so it remains
          // available after restarting Koda or opening another project.
          const configResult = await sdk.client.config.overlayUpdate({
            scope: CUSTOM_PROVIDER_CONFIG_SCOPE,
            set: { provider: config },
          })
          if (configResult.error) {
            toast.show({
              variant: "error",
              message: `Could not save provider configuration: ${errorMessage(configResult.error)}`,
            })
            return
          }

          const apiKey = value.trim()
          if (apiKey) {
            const authResult = await sdk.client.auth.set({
              providerID: props.setup.providerID,
              auth: { type: "api", key: apiKey },
            })
            if (authResult?.error) {
              toast.show({
                variant: "error",
                message: `Provider saved, but API key could not be stored: ${errorMessage(authResult.error)}`,
              })
              return
            }
          }

          await sdk.client.instance.dispose()
          await sync.bootstrap()
          toast.show({ variant: "success", message: `Connected ${props.setup.providerName}` })
          dialog.replace(() => <DialogModel providerID={props.setup.providerID} />)
        } catch (error) {
          toast.show({ variant: "error", message: `Could not connect provider: ${errorMessage(error)}` })
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}

interface ApiMethodProps {
  providerID: string
  title: string
  metadata?: Record<string, string>
}
function ApiMethod(props: ApiMethodProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const { theme } = useTheme()

  const optionalApiKey = kodaProvider.isLocalOptionalApiKey(props.providerID) // koda_change

  return (
    <DialogPrompt
      title={props.title}
      placeholder={kodaProvider.apiKeyPlaceholder(props.providerID)} // koda_change
      description={kodaProvider.renderApiDescription(props.providerID, theme)} // koda_change
      onConfirm={async (value) => {
        const key = value.trim() || (optionalApiKey ? kodaProvider.LOCAL_API_KEY_PLACEHOLDER : "") // koda_change
        if (!key) return // koda_change
        await sdk.client.auth.set({
          providerID: props.providerID,
          auth: {
            type: "api",
            key, // koda_change
            ...(props.metadata ? { metadata: props.metadata } : {}),
          },
        })
        await sdk.client.instance.dispose()
        await sync.bootstrap()
        dialog.replace(() => <DialogModel providerID={props.providerID} />)
      }}
    />
  )
}

interface PromptsMethodProps {
  dialog: ReturnType<typeof useDialog>
  prompts: NonNullable<ProviderAuthMethod["prompts"]>[number][]
}
async function PromptsMethod(props: PromptsMethodProps) {
  const inputs: Record<string, string> = {}
  for (const prompt of props.prompts) {
    if (prompt.when) {
      const value = inputs[prompt.when.key]
      if (value === undefined) continue
      const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
      if (!matches) continue
    }

    if (prompt.type === "select") {
      const value = await new Promise<string | null>((resolve) => {
        props.dialog.replace(
          () => (
            <DialogSelect
              title={prompt.message}
              options={prompt.options.map((x) => ({
                title: x.label,
                value: x.value,
                description: x.hint,
              }))}
              onSelect={(option) => resolve(option.value)}
            />
          ),
          () => resolve(null),
        )
      })
      if (value === null) return null
      inputs[prompt.key] = value
      continue
    }

    const value = await new Promise<string | null>((resolve) => {
      props.dialog.replace(
        () => (
          <DialogPrompt title={prompt.message} placeholder={prompt.placeholder} onConfirm={(value) => resolve(value)} />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    inputs[prompt.key] = value
  }
  return inputs
}
