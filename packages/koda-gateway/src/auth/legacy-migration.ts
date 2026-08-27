/**
 * Legacy koda CLI migration module
 *
 * Migrates authentication from the legacy koda Code VS Code extension CLI
 * config path (~/.koda/cli/config.json) to the new auth.json format.
 */
import fs from "fs/promises"
import os from "os"
import path from "path"

export const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".koda", "cli", "config.json")

interface LegacyProvider {
  id: string
  provider: string
  kodaToken?: string
  kodaModel?: string
  kodaOrganizationId?: string
}

interface LegacyConfig {
  providers?: LegacyProvider[]
}

interface LegacykodaAuth {
  token: string
  organizationId?: string
}

// Auth info types matching opencode's Auth module
type ApiAuth = { type: "api"; key: string }
type OAuthAuth = { type: "oauth"; access: string; refresh: string; expires: number; accountId?: string }
type AuthInfo = ApiAuth | OAuthAuth

/**
 * Extract koda auth from legacy config
 */
function extractkodaAuth(config: LegacyConfig): LegacykodaAuth | undefined {
  if (!config.providers) return undefined

  const provider = config.providers.find((p) => p.provider === "koda")
  if (!provider?.kodaToken) return undefined

  return {
    token: provider.kodaToken,
    organizationId: provider.kodaOrganizationId,
  }
}

/**
 * Migrate koda authentication from legacy CLI config path.
 *
 * Checks ~/.koda/cli/config.json for existing koda credentials
 * and migrates them to the new auth.json format.
 *
 * @param haskodaAuth - Callback to check if koda auth already exists
 * @param savekodaAuth - Callback to save the migrated auth
 * @returns true if migration was performed, false otherwise
 */
export async function migrateLegacykodaAuth(
  haskodaAuth: () => Promise<boolean>,
  savekodaAuth: (auth: AuthInfo) => Promise<void>,
): Promise<boolean> {
  // Skip if koda auth already configured
  if (await haskodaAuth()) return false

  // Check if legacy config exists and parse it
  const content = await fs.readFile(LEGACY_CONFIG_PATH, "utf-8").catch(() => null)
  if (!content) return false

  let config: LegacyConfig | null = null
  try {
    config = JSON.parse(content) as LegacyConfig
  } catch {
    return false
  }

  // Extract koda auth from legacy config
  const legacy = extractkodaAuth(config)
  if (!legacy) return false

  // Migrate to new format
  // Use OAuth format if organization ID present, otherwise API format
  if (legacy.organizationId) {
    await savekodaAuth({
      type: "oauth",
      access: legacy.token,
      refresh: "",
      expires: 0,
      accountId: legacy.organizationId,
    })
  } else {
    await savekodaAuth({
      type: "api",
      key: legacy.token,
    })
  }

  return true
}
