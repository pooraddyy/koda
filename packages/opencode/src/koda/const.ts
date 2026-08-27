import { InstallationVersion } from "@opencode-ai/core/installation/version"

export const DEFAULT_HEADERS = {
  "HTTP-Referer": "https://koda.ai",
  "X-Title": "koda Code",
  "User-Agent": `koda-Code/${InstallationVersion}`,
}
