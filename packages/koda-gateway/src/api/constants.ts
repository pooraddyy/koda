/**
 * koda Gateway Configuration Constants
 * Centralized configuration for all API endpoints, headers, and settings
 */

/** Environment variable for custom koda API URL */
export const ENV_koda_API_URL = "koda_API_URL"

/** Default koda API URL */
export const DEFAULT_koda_API_URL = "https://api.koda.ai"

/** Base URL for koda API - can be overridden by koda_API_URL env var */
export const koda_API_BASE = process.env[ENV_koda_API_URL] || DEFAULT_koda_API_URL

/** Environment variable for custom koda Chat URL */
export const koda_CHAT_URL_ENV = "koda_CHAT_URL"

/** Default koda Chat URL (REST endpoint for messages, conversations, etc.) */
export const koda_DEFAULT_CHAT_URL = "https://chat.kodaapps.io"

/** Base URL for koda Chat - can be overridden by koda_CHAT_URL env var */
export const koda_CHAT_URL = process.env[koda_CHAT_URL_ENV] || koda_DEFAULT_CHAT_URL

/** Environment variable for custom Event Service URL */
export const koda_EVENT_SERVICE_URL_ENV = "EVENT_SERVICE_URL"

/** Default Event Service URL (WebSocket endpoint for koda-chat events) */
export const koda_DEFAULT_EVENT_SERVICE_URL = "wss://events.kodaapps.io"

/** Base URL for Event Service - can be overridden by EVENT_SERVICE_URL env var */
export const koda_EVENT_SERVICE_URL = process.env[koda_EVENT_SERVICE_URL_ENV] || koda_DEFAULT_EVENT_SERVICE_URL

/** Default base URL for OpenRouter-compatible endpoint */
export const koda_OPENROUTER_BASE = `${koda_API_BASE}/api/openrouter`

/** Device auth polling interval in milliseconds */
export const POLL_INTERVAL_MS = 3000

/** Default model for authenticated users */
export const DEFAULT_MODEL = "koda-auto/free"

/** Default model for anonymous/free usage */
export const DEFAULT_FREE_MODEL = "koda-auto/free"

/** Token expiration duration in milliseconds (1 year) */
export const TOKEN_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000

/** User-Agent header base value for requests */
export const USER_AGENT_BASE = "opencode-koda-provider"

/** Content-Type header value for requests */
export const CONTENT_TYPE = "application/json"

/** Default provider name */
export const DEFAULT_PROVIDER_NAME = "koda"

/** Default API key for anonymous requests */
export const ANONYMOUS_API_KEY = "anonymous"

/** Fetch timeout for model requests in milliseconds (10 seconds) */
export const MODELS_FETCH_TIMEOUT_MS = 10 * 1000

/**
 * Header constants for koda API requests
 */
export const HEADER_ORGANIZATIONID = "X-koda-ORGANIZATIONID"
export const HEADER_TASKID = "X-koda-TASKID"
export const HEADER_PARENT_TASKID = "X-koda-PARENT-TASKID"
export const HEADER_PROJECTID = "X-koda-PROJECTID"
export const HEADER_TESTER = "X-koda-TESTER"
export const HEADER_EDITORNAME = "X-koda-EDITORNAME"
export const HEADER_MACHINEID = "X-koda-MACHINEID"

/** Default editor name value */
export const DEFAULT_EDITOR_NAME = "koda CLI"

/** Environment variable name for custom editor name */
export const ENV_EDITOR_NAME = "koda_EDITOR_NAME"

/** Environment variable name for version (set by CLI at startup) */
export const ENV_VERSION = "koda_VERSION"

/** Tester header value for suppressing warnings */
export const TESTER_SUPPRESS_VALUE = "SUPPRESS"

/** Header name for feature tracking */
export const HEADER_FEATURE = "X-koda-FEATURE"

/** Environment variable name for feature override */
export const ENV_FEATURE = "koda_FEATURE"

export const PROMPTS = [
  "codex",
  "gemini",
  "beast",
  "anthropic",
  "trinity",
  "anthropic_without_todo",
  "ling",
  "gpt55",
] as const

export const AI_SDK_PROVIDERS = [
  "anthropic",
  "openai",
  "openai-compatible",
  "openrouter",
] as const
