import * as fs from "fs/promises"
import * as path from "path"
import { Config } from "../config/config"
import { ConfigMCPV1 as ConfigMCP } from "@opencode-ai/core/v1/config/mcp"
import * as Log from "@opencode-ai/core/util/log"
import { Filesystem } from "../util/filesystem"
import { kodaPaths } from "./paths"

export namespace McpMigrator {
  const log = Log.create({ service: "koda.mcp-migrator" })

  // Remote transport types used by the koda extension
  const REMOTE_TYPES = new Set(["streamable-http", "sse"])

  function isRemote(server: kodaMcpServer): boolean {
    return !!server.type && REMOTE_TYPES.has(server.type)
  }

  // koda MCP server structure
  export interface kodaMcpServer {
    command?: string
    args?: string[]
    env?: Record<string, string>
    disabled?: boolean
    alwaysAllow?: string[]
    // Remote server fields
    type?: string
    url?: string
    headers?: Record<string, string>
  }

  export interface kodaMcpSettings {
    mcpServers: Record<string, kodaMcpServer>
  }

  export interface MigrationResult {
    mcp: Record<string, ConfigMCP.Info>
    warnings: string[]
    skipped: Array<{ name: string; reason: string }>
  }

  export async function readMcpSettings(filepath: string): Promise<kodaMcpSettings | null> {
    if (!(await Filesystem.exists(filepath))) return null

    try {
      const content = await fs.readFile(filepath, "utf-8")
      return JSON.parse(content) as kodaMcpSettings
    } catch (err) {
      log.warn("failed to parse MCP settings file, skipping", { filepath, error: err })
      return null
    }
  }

  export function convertServer(name: string, server: kodaMcpServer): ConfigMCP.Info | null {
    if (isRemote(server)) {
      if (!server.url) {
        log.warn("remote MCP server missing url, skipping", { name })
        return null
      }
      const config: ConfigMCP.Info = {
        type: "remote",
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length > 0 && { headers: server.headers }),
        ...(server.disabled && { enabled: false }),
      }
      return config
    }

    if (!server.command) {
      log.warn("local MCP server missing command, skipping", { name })
      return null
    }

    // Build command array: [command, ...args]
    const command = [server.command, ...(server.args ?? [])]

    // Build the MCP config object
    const config: ConfigMCP.Info = {
      type: "local",
      command,
      ...(server.env && Object.keys(server.env).length > 0 && { environment: server.env }),
      ...(server.disabled && { enabled: false }),
    }

    return config
  }

  export async function migrate(options?: {
    projectDir?: string
  }): Promise<MigrationResult> {
    const warnings: string[] = []
    const skipped: Array<{ name: string; reason: string }> = []
    const mcp: Record<string, ConfigMCP.Info> = {}

    const allServers: Array<{ name: string; server: kodaMcpServer }> = []

    // Project-level MCP settings are loaded from the terminal-native Koda directory.
    if (options?.projectDir) {
      for (const dir of [".koda"]) {
        const projectSettingsPath = path.join(options.projectDir, dir, "mcp.json")
        const projectSettings = await readMcpSettings(projectSettingsPath)
        if (projectSettings?.mcpServers) {
          for (const [name, server] of Object.entries(projectSettings.mcpServers)) {
          allServers.push({ name, server })
          }
        }
      }
    }

    // Deduplicate by name (later entries win - project overrides global)
    const serversByName = new Map<string, kodaMcpServer>()
    for (const { name, server } of allServers) {
      serversByName.set(name, server)
    }

    // Convert each server
    for (const [name, server] of serversByName) {
      // Warn about alwaysAllow permissions that cannot be migrated
      if (server.alwaysAllow && server.alwaysAllow.length > 0) {
        warnings.push(
          `MCP server '${name}' has alwaysAllow permissions that cannot be migrated: ${server.alwaysAllow.join(", ")}`,
        )
      }

      const converted = convertServer(name, server)
      if (converted) {
        mcp[name] = converted
      }
    }

    return { mcp, warnings, skipped }
  }

  /**
   * Load project Koda MCP servers and return them as an opencode config partial.
   * This function handles all logging internally, so callers just need to merge the result.
   */
  export async function loadMcpConfig(projectDir: string): Promise<Record<string, ConfigMCP.Info>> {
    try {
      const result = await migrate({ projectDir })

      if (Object.keys(result.mcp).length > 0) {
        log.debug("loaded koda MCP servers", {
          count: Object.keys(result.mcp).length,
          servers: Object.keys(result.mcp),
        })
      }

      for (const skipped of result.skipped) {
        log.debug("skipped koda MCP server", { name: skipped.name, reason: skipped.reason })
      }

      for (const warning of result.warnings) {
        log.warn("koda MCP migration warning", { warning })
      }

      return result.mcp
    } catch (err) {
      log.warn("failed to load koda MCP servers", { error: err })
      return {}
    }
  }
}
