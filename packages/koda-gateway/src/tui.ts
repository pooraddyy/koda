/**
 * koda Gateway TUI Integration
 *
 * This module provides TUI-specific functionality for koda-gateway.
 * It requires OpenCode TUI dependencies to be injected at runtime.
 *
 * Import from "@koda/koda-gateway/tui" for TUI features.
 */

// ============================================================================
// TUI Dependency Injection
// ============================================================================
export { initializeTUIDependencies, getTUIDependencies, areTUIDependenciesInitialized } from "./tui/context.js"
export type { TUIDependencies } from "./tui/types.js"

// ============================================================================
// TUI Helpers
// ============================================================================
export { formatProfileInfo, getOrganizationOptions, getDefaultOrganizationSelection } from "./tui/helpers.js"

// ============================================================================
// NOTE: TUI Components Moved to OpenCode
// ============================================================================
// All TUI components with JSX have been moved to packages/opencode/src/koda/
// to ensure correct JSX transpilation with @opentui/solid.
//
// Components moved:
// - registerkodaCommands -> @/koda/koda-commands
// - DialogkodaTeamSelect -> @/koda/components/dialog-koda-team-select
// - DialogkodaOrganization -> @/koda/components/dialog-koda-organization
// - DialogkodaProfile -> @/koda/components/dialog-koda-profile
// - kodaAutoMethod -> @/koda/components/dialog-koda-auto-method
// - kodaNews -> @/koda/components/koda-news
// - NotificationBanner -> @/koda/components/notification-banner
// - DialogkodaNotifications -> @/koda/components/dialog-koda-notifications
