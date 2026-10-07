import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.KODA_MODELS_URL || "https://models.dev"

async function fetchModelsData(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${url}/api.json`, { signal: controller.signal })
    if (!res.ok) throw new Error(`Failed to fetch models data: ${res.status} ${res.statusText} (${url}/api.json)`)
    const text = await res.text()
    try {
      JSON.parse(text)
    } catch {
      throw new Error(`Invalid JSON received from ${url}/api.json`)
    }
    return text
  } finally {
    clearTimeout(timeout)
  }
}

export const modelsData = process.env.MODELS_DEV_API_JSON
  ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  : await fetchModelsData(modelsUrl)
console.log("Loaded models.dev snapshot")
