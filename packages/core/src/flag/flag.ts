import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["KODA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["KODA_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("KODA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  KODA_AUTO_HEAP_SNAPSHOT: truthy("KODA_AUTO_HEAP_SNAPSHOT"),
  KODA_GIT_BASH_PATH: process.env["KODA_GIT_BASH_PATH"],
  KODA_CONFIG: process.env["KODA_CONFIG"],
  KODA_CONFIG_CONTENT: process.env["KODA_CONFIG_CONTENT"],
  KODA_DISABLE_AUTOUPDATE: truthy("KODA_DISABLE_AUTOUPDATE"),
  KODA_ALWAYS_NOTIFY_UPDATE: truthy("KODA_ALWAYS_NOTIFY_UPDATE"),
  KODA_DISABLE_PRUNE: truthy("KODA_DISABLE_PRUNE"),
  KODA_DISABLE_TERMINAL_TITLE: truthy("KODA_DISABLE_TERMINAL_TITLE"),
  KODA_SHOW_TTFD: truthy("KODA_SHOW_TTFD"),
  KODA_DISABLE_AUTOCOMPACT: truthy("KODA_DISABLE_AUTOCOMPACT"),
  KODA_DISABLE_MODELS_FETCH: truthy("KODA_DISABLE_MODELS_FETCH"),
  KODA_DISABLE_MOUSE: truthy("KODA_DISABLE_MOUSE"),
  KODA_FAKE_VCS: process.env["KODA_FAKE_VCS"],
  KODA_SERVER_PASSWORD: process.env["KODA_SERVER_PASSWORD"],
  KODA_SERVER_USERNAME: process.env["KODA_SERVER_USERNAME"],
  KODA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("KODA_DISABLE_FFF"),

  // Experimental
  KODA_EXPERIMENTAL_FILEWATCHER: Config.boolean("KODA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  KODA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("KODA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  KODA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("KODA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  KODA_MODELS_URL: process.env["KODA_MODELS_URL"],
  KODA_MODELS_PATH: process.env["KODA_MODELS_PATH"],
  KODA_DB: process.env["KODA_DB"],

  KODA_WORKSPACE_ID: process.env["KODA_WORKSPACE_ID"],
  KODA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("KODA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get KODA_DISABLE_PROJECT_CONFIG() {
    return truthy("KODA_DISABLE_PROJECT_CONFIG")
  },
  get KODA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("KODA_EXPERIMENTAL_REFERENCES")
  },
  get KODA_TUI_CONFIG() {
    return process.env["KODA_TUI_CONFIG"]
  },
  get KODA_CONFIG_DIR() {
    return process.env["KODA_CONFIG_DIR"]
  },
  get KODA_PURE() {
    return truthy("KODA_PURE")
  },
  get KODA_PERMISSION() {
    return process.env["KODA_PERMISSION"]
  },
  get KODA_PLUGIN_META_FILE() {
    return process.env["KODA_PLUGIN_META_FILE"]
  },
  get KODA_CLIENT() {
    return process.env["KODA_CLIENT"] ?? "cli"
  },
}
