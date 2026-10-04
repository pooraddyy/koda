import path from "path"

process.env.KODA_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
process.env.KODA_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.KODA_DISABLE_MODELS_FETCH = "true"
