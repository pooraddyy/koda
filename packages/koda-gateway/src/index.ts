// ============================================================================
// Plugin
// ============================================================================
export { kodaAuthPlugin, default } from "./plugin.js"

// ============================================================================
// Provider
// ============================================================================
export { createkoda } from "./provider.js"
export { createkodaDebug } from "./provider-debug.js"
export { kodaCustomLoader } from "./loader.js"
export { buildkodaHeaders, getEditorNameHeader, getFeatureHeader, getDefaultHeaders, getUserAgent } from "./headers.js"

// ============================================================================
// Auth
// ============================================================================
export { authenticateWithDeviceAuth } from "./auth/device-auth.js"
export { authenticateWithDeviceAuthTUI } from "./auth/device-auth-tui.js"
export { getkodaUrlFromToken, isValidkodaToken, getApiKey } from "./auth/token.js"
export { poll, formatTimeRemaining } from "./auth/polling.js"
export { migrateLegacykodaAuth, LEGACY_CONFIG_PATH } from "./auth/legacy-migration.js"

// ============================================================================
// API
// ============================================================================
export {
  fetchProfile,
  fetchBalance,
  fetchProfileWithBalance,
  fetchDefaultModel,
  getkodaProfile,
  defaultOrganizationId,
  getkodaBalance,
  getkodaDefaultModel,
  promptOrganizationSelection,
} from "./api/profile.js"
export { fetchkodaPassState } from "./api/koda-pass.js"
export {
  fetchkodaModels,
  type kodaModelsResult,
  fetchkodaImageModels,
  type kodaImageModel,
  type kodaImageModelsResult,
  fetchkodaTranscriptionModels,
  type kodaTranscriptionModel,
  type kodaTranscriptionModelsResult,
} from "./api/models.js"
export {
  EMPTY_koda_EMBEDDING_MODEL_CATALOG,
  fetchkodaEmbeddingModelCatalog,
  type kodaEmbeddingModel,
  type kodaEmbeddingModelCatalog,
  type kodaEmbeddingModelCatalogIssue,
} from "./api/embedding-models.js"
export { resolvekodaGatewayBaseUrl, resolvekodaOpenRouterBaseUrl } from "./api/url.js"
export {
  AUTOCOMPLETE_MODELS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  getAutocompleteModel,
  getAutocompleteModelById,
  validAutocompleteModel,
  validAutocompleteProvider,
  type AutocompleteModelDef,
  type AutocompleteProviderID,
} from "./autocomplete.js"
export {
  fetchOrganizationModes,
  clearModesCache,
  type OrganizationMode,
  type OrganizationModeConfig,
} from "./api/modes.js"
export { fetchkodaNotifications, type kodaNotification } from "./api/notifications.js"
export {
  fetchByokEntries,
  fetchCodingPlanSubscriptions,
  fetchCodingPlanUsage,
  type ByokEntry,
  type CodingPlanSubscription,
  type CodingPlanQuotaWindow,
} from "./api/trpc.js"
export {
  fetchCloudSession,
  fetchCloudSessionForImport,
  SessionImportValidationError,
  prepareSessionImport,
  importSessionToDb,
} from "./cloud-sessions.js"

// ============================================================================
// Server Routes (optional - requires hono and OpenCode dependencies)
// ============================================================================
export { createkodaRoutes } from "./server/routes.js"
export {
  GatewayError,
  UnauthorizedError,
  getOrganizationId,
  getClawChatCredentials,
  getClawStatus,
  getCloudSessions,
  getNotifications,
  getProfile,
  getToken,
  normalizeClawStatus,
  setOrganization,
} from "./server/handlers.js"

// ============================================================================
// Note: TUI exports moved to separate entry point
// ============================================================================
// For TUI components and commands, import from "@koda/koda-gateway/tui"
// This avoids circular dependencies with opencode TUI infrastructure

// ============================================================================
// Types
// ============================================================================
export type {
  // Auth types
  DeviceAuthInitiateResponse,
  DeviceAuthPollResponse,
  Organization,
  kodaProfile,
  kodaBalance,
  kodaPassState,
  PollOptions,
  PollResult,
  // Provider types
  kodaProvider,
  kodaProviderOptions,
  kodaMetadata,
  CustomLoaderResult,
  ProviderInfo,
  LanguageModelV3,
} from "./types.js"

// ============================================================================
// Constants
// ============================================================================
export {
  ENV_koda_API_URL,
  DEFAULT_koda_API_URL,
  koda_API_BASE,
  koda_CHAT_URL,
  koda_EVENT_SERVICE_URL,
  koda_OPENROUTER_BASE,
  POLL_INTERVAL_MS,
  DEFAULT_MODEL,
  DEFAULT_FREE_MODEL,
  TOKEN_EXPIRATION_MS,
  USER_AGENT_BASE,
  CONTENT_TYPE,
  DEFAULT_PROVIDER_NAME,
  ANONYMOUS_API_KEY,
  MODELS_FETCH_TIMEOUT_MS,
  HEADER_ORGANIZATIONID,
  HEADER_TASKID,
  HEADER_PARENT_TASKID,
  HEADER_PROJECTID,
  HEADER_TESTER,
  HEADER_EDITORNAME,
  HEADER_MACHINEID,
  HEADER_FEATURE,
  DEFAULT_EDITOR_NAME,
  ENV_EDITOR_NAME,
  ENV_VERSION,
  TESTER_SUPPRESS_VALUE,
  ENV_FEATURE,
  PROMPTS,
  AI_SDK_PROVIDERS,
} from "./api/constants.js"
