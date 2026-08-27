import * as Log from "@opencode-ai/core/util/log"
import { InstallationBuildKind } from "@opencode-ai/core/installation/version"

export namespace kodaLog {
  export function init() {
    const value = process.env.koda_LOG_LEVEL?.toUpperCase()
    const level: Log.Level =
      value === "DEBUG" || value === "INFO" || value === "WARN" || value === "ERROR"
        ? value
        : InstallationBuildKind === "release"
          ? "INFO"
          : "DEBUG"
    return Log.init({
      print: process.env.koda_PRINT_LOGS === "1",
      dev: InstallationBuildKind !== "release",
      level,
    })
  }
}
