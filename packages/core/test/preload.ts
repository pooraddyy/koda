import path from "path"

process.env.koda_DB = ":memory:"
process.env.koda_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.koda_DISABLE_MODELS_FETCH = "true"

// koda_change start - fail closed: core unit tests do not redirect XDG dirs, so koda_DB
// is the only thing keeping them off the real ~/.local/share/koda database. Verify the
// resolved path (env is read at flag import time, so this must stay after the env writes).
const { Database } = await import("../src/database/database")
const resolved = Database.path()
if (resolved !== ":memory:") {
  throw new Error(`unit test preload: database path must resolve to ":memory:", got "${resolved}"`)
}
// koda_change end
