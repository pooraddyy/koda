declare global {
  const KODA_VERSION: string
  const KODA_CHANNEL: string
}

export const InstallationVersion = typeof KODA_VERSION === "string" ? KODA_VERSION : "local"
export const InstallationChannel = typeof KODA_CHANNEL === "string" ? KODA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
