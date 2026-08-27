import { useTerminalDimensions } from "@opentui/solid" // koda_change
import { createEffect, createMemo, createSignal, Show } from "solid-js" // koda_change
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { map, pipe, sortBy, take } from "remeda" // koda_change
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import type { Model } from "@koda/sdk/v2" // koda_change
import { useConnected } from "./use-connected"
import { ModelInfoPanel } from "@/koda/components/model-info-panel" // koda_change
import { FreeModelDisclosure } from "@/koda/components/free-model-disclosure" // koda_change
import { buildModelPickerOptions, rankProviderOptions } from "../koda/model-picker" // koda_change

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")
  const dimensions = useTerminalDimensions() // koda_change

  const connected = useConnected()
  const providers = createDialogProviderOptions()
  // koda_change start
  // Memoize anything that iterates all koda models to avoid calculating it for
  // each koda model and tanking the UI at a couple hundred models
  const kodaRank = createMemo(() => {
    const provider = sync.data.provider.find((provider) => provider.id === "koda")
    const models = provider?.models ?? {}
    return new Map(Object.entries(models).map(([id, info]) => [id, info.recommendedIndex ?? Infinity] as const))
  })
  // koda_change end

  const showExtra = createMemo(() => connected() && !props.providerID)

  // koda_change start
  const wide = createMemo(() => dimensions().width >= 108)
  const [preview, setPreview] = createSignal<{
    model: Model
    provider: string
  }>()

  const lookup = (providerID: string, modelID: string) => {
    const provider = sync.data.provider.find((x) => x.id === providerID)
    const model = provider?.models[modelID]
    if (!provider || !model) return
    return {
      model,
      provider: provider.name,
    }
  }

  createEffect(() => {
    dialog.setSize(wide() ? "xlarge" : "large")
  })

  createEffect(() => {
    const current = local.model.current()
    if (!current) return
    const next = lookup(current.providerID, current.modelID)
    if (!next) return
    setPreview(next)
  })

  const footer = (providerID: string, model: Model) => {
    const labels = [
      providerID === "koda" && FreeModelDisclosure.hasByok(model) ? FreeModelDisclosure.byok : undefined,
      providerID === "koda" && FreeModelDisclosure.collectsData(model) ? FreeModelDisclosure.label : undefined,
      model.cost?.input === 0 && providerID === "opencode" ? "Free" : undefined,
    ].filter((label) => label !== undefined)
    return labels.length > 0 ? labels.join(" · ") : undefined
  }
  // koda_change end

  // koda_change start - option building lives in koda/model-picker so the
  // koda Gateway grouping/search rules can be unit tested
  const options = createMemo(() => {
    const needle = query().trim()
    const modelOptions = buildModelPickerOptions({
      providers: sync.data.provider,
      favorites: connected() ? local.model.favorite() : [],
      recents: local.model.recent(),
      connected: connected(),
      showExtra: showExtra(),
      providerID: props.providerID,
      query: needle,
      footer,
      onSelect,
      sort: (items) => sortModelOptions(items, props.providerID !== undefined, kodaRank()),
    })

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    return [...modelOptions, ...(needle ? rankProviderOptions(needle, popularProviders) : popularProviders)]
  })
  // koda_change end

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((item) => item.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    const value = provider()
    if (!value) return "Select model"
    return value.name
  })

  function onSelect(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  // koda_change start
  return (
    <box flexDirection="row">
      <box flexGrow={1} flexShrink={1}>
        <DialogSelect<ReturnType<typeof options>[number]["value"]>
          options={options()}
          actions={[
            {
              command: "model.dialog.provider",
              title: connected() ? "Connect provider" : "View all providers",
              onTrigger() {
                dialog.replace(() => <DialogProvider />)
              },
            },
            {
              command: "model.dialog.favorite",
              title: "Favorite",
              hidden: !connected(),
              onTrigger: (option) => {
                local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
              },
            },
          ]}
          onFilter={setQuery}
          onMove={(option) => {
            if (typeof option.value === "string") {
              setPreview(undefined)
              return
            }
            const next = lookup(option.value.providerID, option.value.modelID)
            if (!next) return
            setPreview(next)
          }}
          // koda_change: removed flat={true} to keep section headers visible while filtering
          skipFilter={true}
          title={title()}
          current={local.model.current()}
        />
      </box>
      <Show when={wide() && preview()}>
        {(item) => <ModelInfoPanel model={item().model} provider={item().provider} />}
      </Show>
    </box>
  )
  // koda_change end
}

export function sortModelOptions<
  T extends {
    footer?: string
    releaseDate: string | number
    title: string
    value?: { providerID: string; modelID: string } // koda_change
  },
>(
  options: T[],
  newestFirst: boolean,
  rank: ReadonlyMap<string, number> = new Map(), // koda_change
) {
  // koda_change start - Sort within Recommended / koda Gateway
  const recommended = (option: T) =>
    option.value?.providerID === "koda" ? (rank.get(option.value.modelID) ?? Infinity) : 0
  // koda_change end
  if (newestFirst)
    return sortBy(
      options,
      recommended, // koda_change
      [(option) => option.releaseDate, "desc"],
      (option) => option.title,
    )
  return sortBy(
    options,
    recommended, // koda_change
    (option) => option.footer === undefined,
    [(option) => option.releaseDate, "desc"], // koda_change - free model footers include koda disclosure labels
    (option) => option.title,
  )
}
