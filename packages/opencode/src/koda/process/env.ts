export function model(extra?: NodeJS.ProcessEnv | null): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...(extra ?? {}) }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
  delete env.koda_SERVER_PASSWORD
  delete env.koda_SERVER_USERNAME
  delete env.koda_CONFIG
  delete env.koda_CONFIG_CONTENT
  delete env.koda_CONFIG_DIR
  return env
}
