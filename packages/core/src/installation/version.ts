declare global {
  const koda_VERSION: string
  const koda_CHANNEL: string
  const koda_BUILD_KIND: string // koda_change
}

export const InstallationVersion = typeof koda_VERSION === "string" ? koda_VERSION : "local"
export const InstallationChannel = typeof koda_CHANNEL === "string" ? koda_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
// koda_change start - distinguish release builds from source / local builds
export const InstallationBuildKind: "source" | "release" =
  typeof koda_BUILD_KIND === "string" && koda_BUILD_KIND === "release" ? "release" : "source"
// koda_change end
