import { Config } from "effect"
import { InstallationChannel } from "../installation/version" // koda_change

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

// koda_change start
function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

const UNSTABLE_CHANNELS = new Set(["dev", "beta", "local"])
function unstableDefault(key: string) {
  return truthy(key) || (!falsy(key) && UNSTABLE_CHANNELS.has(InstallationChannel))
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const koda_EXPERIMENTAL = truthy("koda_EXPERIMENTAL")
const koda_DISABLE_CLAUDE_CODE = truthy("koda_DISABLE_CLAUDE_CODE")
const koda_DISABLE_CLAUDE_CODE_SKILLS = koda_DISABLE_CLAUDE_CODE || truthy("koda_DISABLE_CLAUDE_CODE_SKILLS")
// koda_change end
const copy = process.env["koda_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["koda_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("koda_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  koda_AUTO_SHARE: truthy("koda_AUTO_SHARE"), // koda_change
  koda_AUTO_HEAP_SNAPSHOT: truthy("koda_AUTO_HEAP_SNAPSHOT"),
  koda_GIT_BASH_PATH: process.env["koda_GIT_BASH_PATH"],
  koda_CONFIG: process.env["koda_CONFIG"],
  koda_CONFIG_CONTENT: process.env["koda_CONFIG_CONTENT"],
  koda_DISABLE_AUTOUPDATE: truthy("koda_DISABLE_AUTOUPDATE"),
  koda_ALWAYS_NOTIFY_UPDATE: truthy("koda_ALWAYS_NOTIFY_UPDATE"),
  koda_DISABLE_PRUNE: truthy("koda_DISABLE_PRUNE"),
  koda_DISABLE_TERMINAL_TITLE: truthy("koda_DISABLE_TERMINAL_TITLE"),
  koda_SHOW_TTFD: truthy("koda_SHOW_TTFD"),
  // koda_change start
  koda_DISABLE_DEFAULT_PLUGINS: truthy("koda_DISABLE_DEFAULT_PLUGINS"),
  koda_DISABLE_LSP_DOWNLOAD: truthy("koda_DISABLE_LSP_DOWNLOAD"),
  koda_ENABLE_EXPERIMENTAL_MODELS: truthy("koda_ENABLE_EXPERIMENTAL_MODELS"),
  // koda_change end
  koda_DISABLE_AUTOCOMPACT: truthy("koda_DISABLE_AUTOCOMPACT"),
  koda_DISABLE_MODELS_FETCH: truthy("koda_DISABLE_MODELS_FETCH"),
  koda_DISABLE_MOUSE: truthy("koda_DISABLE_MOUSE"),
  // koda_change start
  koda_DISABLE_CLAUDE_CODE,
  koda_DISABLE_CLAUDE_CODE_PROMPT: koda_DISABLE_CLAUDE_CODE || truthy("koda_DISABLE_CLAUDE_CODE_PROMPT"),
  koda_DISABLE_CLAUDE_CODE_SKILLS,
  koda_DISABLE_EXTERNAL_SKILLS: truthy("koda_DISABLE_EXTERNAL_SKILLS"),
  koda_EXPERIMENTAL_CUSTOMIZE_SKILL: unstableDefault("koda_EXPERIMENTAL_CUSTOMIZE_SKILL"),
  // koda_change end
  koda_FAKE_VCS: process.env["koda_FAKE_VCS"],
  koda_SERVER_PASSWORD: process.env["koda_SERVER_PASSWORD"],
  koda_SERVER_USERNAME: process.env["koda_SERVER_USERNAME"],
  koda_ENABLE_QUESTION_TOOL: truthy("koda_ENABLE_QUESTION_TOOL"), // koda_change

  koda_EXPERIMENTAL, // koda_change

  koda_EXPERIMENTAL_FILEWATCHER: Config.boolean("koda_EXPERIMENTAL_FILEWATCHER").pipe(Config.withDefault(false)), // koda_change

  koda_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("koda_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),

  koda_EXPERIMENTAL_ICON_DISCOVERY: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_ICON_DISCOVERY"), // koda_change

  koda_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("koda_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),

  koda_ENABLE_EXA: truthy("koda_ENABLE_EXA") || koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_EXA"), // koda_change

  koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"), // koda_change

  koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX"), // koda_change

  koda_EXPERIMENTAL_OXFMT: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_OXFMT"), // koda_change

  koda_EXPERIMENTAL_LSP_TY: truthy("koda_EXPERIMENTAL_LSP_TY"), // koda_change

  koda_EXPERIMENTAL_LSP_TOOL: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_LSP_TOOL"), // koda_change

  koda_EXPERIMENTAL_PLAN_MODE: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_PLAN_MODE"), // koda_change

  koda_EXPERIMENTAL_SCOUT: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_SCOUT"), // koda_change

  koda_EXPERIMENTAL_MARKDOWN: !falsy("koda_EXPERIMENTAL_MARKDOWN"), // koda_change

  koda_ENABLE_PARALLEL: truthy("koda_ENABLE_PARALLEL") || truthy("koda_EXPERIMENTAL_PARALLEL"), // koda_change

  koda_MODELS_URL: process.env["koda_MODELS_URL"],

  koda_MODELS_PATH: process.env["koda_MODELS_PATH"],

  koda_DISABLE_EMBEDDED_WEB_UI: truthy("koda_DISABLE_EMBEDDED_WEB_UI"), // koda_change

  koda_DB: process.env["koda_DB"],

  koda_DISABLE_CHANNEL_DB: truthy("koda_DISABLE_CHANNEL_DB"), // koda_change

  koda_SKIP_MIGRATIONS: truthy("koda_SKIP_MIGRATIONS"), // koda_change

  koda_STRICT_CONFIG_DEPS: truthy("koda_STRICT_CONFIG_DEPS"), // koda_change

  koda_WORKSPACE_ID: process.env["koda_WORKSPACE_ID"],

  koda_EXPERIMENTAL_WORKSPACES: enabledByExperimental("koda_EXPERIMENTAL_WORKSPACES"),

  koda_EXPERIMENTAL_EVENT_SYSTEM: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_EVENT_SYSTEM"), // koda_change

  koda_EXPERIMENTAL_SESSION_SWITCHING: koda_EXPERIMENTAL || truthy("koda_EXPERIMENTAL_SESSION_SWITCHING"), // koda_change

  koda_EXPERIMENTAL_SESSION_SWITCHER: enabledByExperimental("koda_EXPERIMENTAL_SESSION_SWITCHER"), // koda_change

  koda_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("koda_DISABLE_FFF"), // koda_change

  get koda_DISABLE_PROJECT_CONFIG() {
    return truthy("koda_DISABLE_PROJECT_CONFIG")
  },
  get koda_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("koda_EXPERIMENTAL_REFERENCES")
  },
  get koda_TUI_CONFIG() {
    return process.env["koda_TUI_CONFIG"]
  },
  get koda_CONFIG_DIR() {
    return process.env["koda_CONFIG_DIR"]
  },
  get koda_PURE() {
    return truthy("koda_PURE")
  },
  get koda_PERMISSION() {
    return process.env["koda_PERMISSION"]
  },
  get koda_PLUGIN_META_FILE() {
    return process.env["koda_PLUGIN_META_FILE"]
  },
  get koda_CLIENT() {
    return process.env["koda_CLIENT"] ?? "cli"
  },
  // koda_change start
  get koda_SESSION_RETRY_LIMIT() {
    return number("koda_SESSION_RETRY_LIMIT")
  },
  // koda_change end
}
