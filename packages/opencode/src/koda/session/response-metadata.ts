import type { ProviderMetadata } from "@opencode-ai/llm"
import { isRecord } from "@/util/record"

export namespace kodaResponseMetadata {
  function vercelID(value: unknown) {
    if (typeof value !== "string") return
    const id = value.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/.test(id)) return
    return id
  }

  export function write(metadata: ProviderMetadata | undefined, headers: Record<string, string> | undefined) {
    const id = vercelID(Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === "x-vercel-id")?.[1])
    if (!id) return metadata
    const koda = isRecord(metadata?.koda) ? metadata.koda : {}
    return { ...metadata, koda: { ...koda, vercelID: id } }
  }

  export function read(metadata: ProviderMetadata | undefined) {
    const koda = metadata?.koda
    if (!isRecord(koda)) return
    return vercelID(koda.vercelID)
  }
}
