import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}
// koda_change start
const env = {
  koda_CHANNEL: process.env["koda_CHANNEL"],
  koda_BUMP: process.env["koda_BUMP"],
  koda_VERSION: process.env["koda_VERSION"],
  koda_RELEASE: process.env["koda_RELEASE"],
  koda_PRE_RELEASE: process.env["koda_PRE_RELEASE"],
}
// koda_change end
const CHANNEL = await (async () => {
  if (env.koda_CHANNEL) return env.koda_CHANNEL // koda_change
  // koda_change start - publish to "rc" channel for pre-releases
  if (env.koda_PRE_RELEASE === "true") return "rc"
  // koda_change end
  if (env.koda_BUMP) return "latest" // koda_change
  if (env.koda_VERSION && !env.koda_VERSION.startsWith("0.0.0-")) return "latest" // koda_change
  return await $`git branch --show-current`.text().then((x) => x.trim().replace(/[^0-9A-Za-z-]/g, "-")) // koda_change
})()
const IS_PREVIEW = CHANNEL !== "latest"

// koda_change start - shared helpers for version computation
function parseVersion(input: string) {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    value: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

function compareVersion(
  a: NonNullable<ReturnType<typeof parseVersion>>,
  b: NonNullable<ReturnType<typeof parseVersion>>,
) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

async function fetchLatest() {
  const data: any = await fetch("https://registry.npmjs.org/@koda-code/cli/latest").then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  })
  return data.version as string
}

async function fetchHighest() {
  if (!process.env.GH_REPO) return fetchLatest()
  const data: { tagName: string }[] = await $`gh release list --json tagName --limit 100 --repo ${process.env.GH_REPO}`
    .json()
    .catch(() => [])
  const versions = data.flatMap((item) => {
    const version = parseVersion(item.tagName)
    if (!version) return []
    return [version]
  })
  const highest = versions.sort(compareVersion).at(-1)
  if (highest) return highest.value
  return fetchLatest()
}

function bumpVersion(current: string, type: string) {
  const version = parseVersion(current)
  if (!version) throw new Error(`Invalid version: ${current}`)
  if (type === "major") return `${version.major + 1}.0.0`
  if (type === "minor") return `${version.major}.${version.minor + 1}.0`
  return `${version.major}.${version.minor}.${version.patch + 1}`
}
// koda_change end

const VERSION = await (async () => {
  if (env.koda_VERSION) return env.koda_VERSION
  if (IS_PREVIEW) {
    // koda_change start - rc releases use plain semver required by VS Code Marketplace
    if (env.koda_BUMP && env.koda_PRE_RELEASE === "true") {
      const current = await fetchHighest()
      return bumpVersion(current, env.koda_BUMP.toLowerCase())
    }
    // koda_change end
    return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  }
  const version = await fetchHighest() // koda_change
  return bumpVersion(version, env.koda_BUMP?.toLowerCase() ?? "patch") // koda_change
})()

// koda_change start
const team = [
  "actions-user",
  "alexkgold",
  "arimesser",
  "arkadiykondrashov",
  "bturcotte520",
  "chrarnoldus",
  "codingelves",
  "dependabot[bot]",
  "dosire",
  "Drixled",
  "DScdng",
  "emilieschario",
  "eshurakov",
  "evanjacobson",
  "Helix-koda",
  "iscekic",
  "jeanduplessis",
  "jobrietbergen",
  "johnnyeric",
  "jrf0110",
  "koda-code-bot",
  "koda-code-bot[bot]",
  "koda-maintainer[bot]",
  "koda-bot",
  "kodaconnect-lite[bot]",
  "kodaconnect[bot]",
  "kirillk",
  "lambertjosh",
  "marius-koda",
  "olearycrew",
  "pandemicsyn",
  "pedroheyerdahl",
  "RSO",
  "sbreitenother",
  "St0rmz1",
  "suhailkc2025",
]
// koda_change end

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.koda_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`koda script`, JSON.stringify(Script, null, 2)) // koda_change
