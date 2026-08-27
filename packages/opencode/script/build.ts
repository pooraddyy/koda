#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import os from "os" // koda_change
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import { createRequire } from "module" // koda_change

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")
const require = createRequire(import.meta.url) // koda_change

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"
import pkg from "../package.json"
// koda_change start
import { stageBubblewrap } from "./koda/bubblewrap"
import { LanceDBRuntime } from "../src/koda/lancedb"
import { kodaSandboxWorker } from "./koda/koda-sandbox-worker"
import { kodaSandboxNetwork } from "./koda/koda-sandbox-network"
// koda_change end

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const keepDist = process.argv.includes("--keep-dist") || process.env.koda_KEEP_DIST === "1"
const requestedTargets = new Set(
  (process.env.koda_BUILD_TARGETS ?? "")
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean),
)
const plugin = createSolidTransformPlugin()

// koda_change start - codebase indexing
async function copyTreeSitterWasms(outputDir: string) {
  const runtimeWasmPath = require.resolve("web-tree-sitter/tree-sitter.wasm")
  const languagePackagePath = require.resolve("tree-sitter-wasms/package.json")
  const languageWasmDir = path.join(path.dirname(languagePackagePath), "out")
  const targetDir = path.join(outputDir, "tree-sitter")

  await fs.promises.mkdir(targetDir, { recursive: true })
  await fs.promises.copyFile(runtimeWasmPath, path.join(targetDir, "tree-sitter.wasm"))

  const languageWasmFiles = (await fs.promises.readdir(languageWasmDir)).filter((file) => file.endsWith(".wasm"))

  await Promise.all(
    languageWasmFiles.map((file) => fs.promises.copyFile(path.join(languageWasmDir, file), path.join(targetDir, file))),
  )

  console.log(`copied ${languageWasmFiles.length + 1} tree-sitter wasm files to ${targetDir}`)
}

function smokeEnv(root: string) {
  const env = { ...process.env }
  delete env.koda_MODELS_PATH
  delete env.koda_MODELS_URL
  delete env.koda_CONFIG
  delete env.koda_CONFIG_DIR
  return {
    ...env,
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    koda_DISABLE_MODELS_FETCH: "1",
    koda_DISABLE_PROJECT_CONFIG: "1",
    koda_CONFIG_CONTENT: JSON.stringify({ enabled_providers: ["anthropic"] }),
    ANTHROPIC_API_KEY: "dummy",
  }
}

async function smokeModels(binaryPath: string) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "koda-models-"))
  try {
    const out = await $`${binaryPath} --pure models anthropic`.env(smokeEnv(root)).text()
    if (out.split(/\r?\n/).some((line) => line.startsWith("anthropic/"))) return
    throw new Error("Compiled binary did not list Anthropic models from the embedded snapshot")
  } finally {
    await fs.promises
      .rm(root, { recursive: true, force: true })
      .catch((err) => console.warn(`Failed to remove smoke test directory ${root}`, err))
  }
}


const treeSitterWorker = await Bun.file(fileURLToPath(import.meta.resolve("@opentui/core/parser.worker"))).text()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "arm64",
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional Bun artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : requestedTargets.size > 0
    ? allTargets.filter((item) =>
        requestedTargets.has(
          [item.os === "win32" ? "windows" : item.os, item.arch, item.avx2 === false ? "baseline" : undefined, item.abi]
            .filter(Boolean)
            .join("-"),
        ),
      )
    : allTargets

// koda_change start
if (!keepDist) await $`rm -rf dist`
const [sandboxWorkerBundle, sandboxNetworkBundle] = await Promise.all([
  kodaSandboxWorker.bundle(),
  kodaSandboxNetwork.bundle(),
])
// koda_change end

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")

  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`
  // koda_change start
  const bwrap =
    item.os === "linux" && process.env.koda_SKIP_BUNDLED_BWRAP !== "1"
      ? await stageBubblewrap(item.arch, path.resolve(dir, `dist/${name}/bin`))
      : undefined
  // koda_change end

  const workerPath = "./src/cli/tui/worker.ts"
  const treeSitterWorkerPath = "opentui-tree-sitter-worker.js"
  // koda_change start
  const sessionExportWorkerPath = "./src/koda/session-export/worker.ts"
  const indexingWorkerPath = "./src/koda/indexing-worker.ts"
  // koda_change end

  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"

  await Bun.build({
    conditions: ["bun", "node"], // koda_change - port anomalyco/opencode#30873; current form from #31566
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    // koda_change start - skip sourcemaps for release builds (each .js.map adds ~50 MB per target → ~600 MB total)
    sourcemap: Script.release ? "none" : "external",
    external: ["node-gyp", ...LanceDBRuntime.external],
    // koda_change end
    format: "esm",
    minify: true,
    // koda_change start - disable code-splitting to avoid a Bun 1.3.14 codegen bug.
    // With splitting:true Bun emits cross-chunk re-exports like `import{vn as G9}` whose
    // binding isn't top-level, so the compiled binary crashes at startup on the baseline
    // target: "SyntaxError: Exported binding 'G9' needs to refer to a top-level declared
    // variable." (Bun oven-sh/bun#25621, #5344, #7265; also opencode#23349). Fixed upstream
    // in Bun#26089, post-1.3.14. Splitting only deduped shared code between the entrypoints;
    // turning it off inlines per entrypoint and produces a valid binary.
    splitting: false,
    // koda_change end
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkg.name, "bun") as any,
      // koda_change start
      outfile: `dist/${name}/bin/koda`,
      execArgv: [`--user-agent=koda/${Script.version}`, "--use-system-ca", "--"],
      // koda_change end
      windows: {},
    },
    // koda_change start - packages/app was removed; no embedded web UI
    files: { [treeSitterWorkerPath]: treeSitterWorker },
    entrypoints: ["./src/index.ts", workerPath, treeSitterWorkerPath, sessionExportWorkerPath, indexingWorkerPath],
    // koda_change end
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      koda_VERSION: `'${Script.version}'`,
      koda_MODELS_DEV: generated.modelsData,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + treeSitterWorkerPath,
      koda_WORKER_PATH: workerPath,
      // koda_change start
      koda_SESSION_EXPORT_WORKER_PATH: sessionExportWorkerPath,
      koda_INDEXING_WORKER_PATH: indexingWorkerPath,
      koda_SANDBOX_MUTATION_WORKER_PATH: JSON.stringify(kodaSandboxWorker.filename),
      koda_SANDBOX_NETWORK_RELAY_PATH: item.os === "linux" ? JSON.stringify(kodaSandboxNetwork.relay) : "undefined",
      koda_SANDBOX_SECCOMP_PATH: item.os === "linux" ? JSON.stringify(kodaSandboxNetwork.seccomp) : "undefined",
      // koda_change end
      koda_CHANNEL: `'${Script.channel}'`,
      koda_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
      // koda_change start
      koda_BWRAP_SHA256: bwrap ? `'${bwrap}'` : "undefined",
      koda_BUILD_KIND: Script.release ? `'release'` : `'source'`,
      // koda_change end
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  // koda_change start
  await copyTreeSitterWasms(path.resolve(dir, `dist/${name}/bin`))
  await kodaSandboxWorker.copy(sandboxWorkerBundle, path.resolve(dir, `dist/${name}/bin`))
  if (item.os === "linux") {
    await kodaSandboxNetwork.copy(sandboxNetworkBundle, path.resolve(dir, `dist/${name}/bin`), item.arch)
  }

  if (item.os === "linux") {
    const interpreters: Record<string, string> = {
      x64: "/lib64/ld-linux-x86-64.so.2",
      arm64: "/lib/ld-linux-aarch64.so.1",
      "x64-musl": "/lib/ld-musl-x86_64.so.1",
      "arm64-musl": "/lib/ld-musl-aarch64.so.1",
    }
    const key = item.abi === "musl" ? `${item.arch}-musl` : item.arch
    const interpreter = interpreters[key]
    if (interpreter) {
      try {
        await $`patchelf --set-interpreter ${interpreter} dist/${name}/bin/koda`
        console.log(`patched interpreter for ${name} -> ${interpreter}`)
      } catch {
        console.warn(`patchelf not available, skipping interpreter fix for ${name}`)
      }
    }
  }
  // koda_change end

  // Smoke test: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const binaryPath = `dist/${name}/bin/koda` // koda_change
    console.log(`Running smoke test: ${binaryPath} --version`)
    try {
      const versionOutput = await $`${binaryPath} --version`.text()
      console.log(`Smoke test passed: ${versionOutput.trim()}`)
      // koda_change start
      console.log(`Running smoke test: ${binaryPath} --pure models anthropic`)
      await smokeModels(binaryPath)
      console.log("Models snapshot smoke test passed")
      await kodaSandboxWorker.smoke(binaryPath)
      console.log("koda sandbox mutation worker smoke test passed")
      // koda_change end
      // koda_change start
    } catch (e) {
      console.error(`Smoke test failed for ${name}:`, e)
      process.exit(1)
    }
  }
  // koda_change end

  await $`rm -rf ./dist/${name}/bin/tui`
  // koda_change start
  if (item.os === "linux") {
    const content = await Promise.all([
      Bun.file(path.resolve(dir, "../../LICENSE")).text(),
      Bun.file(path.resolve(dir, `dist/${name}/bin/licenses/sandbox-runtime/LICENSE`)).text(),
      ...(bwrap
        ? ["NOTICE", "COPYING", "MUSL-COPYRIGHT"].map((file) =>
            Bun.file(path.resolve(dir, `dist/${name}/bin/licenses/bubblewrap/${file}`)).text(),
          )
        : []),
    ])
    await Bun.write(`dist/${name}/LICENSE`, content.join("\n\n---\n\n"))
  }
  // koda_change end
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        license: item.os === "linux" ? "SEE LICENSE IN LICENSE" : pkg.license, // koda_change
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        // koda_change start
        keywords: pkg.keywords,
        private: pkg.private,
        repository: {
          type: "git",
          url: "https://github.com/pooraddyy/koda",
        },
        // koda_change end
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version
}

if (Script.release) {
  const archives: string[] = [] // koda_change
  for (const key of Object.keys(binaries)) {
    const archive = key.replace(pkg.name, "koda") // koda_change
    if (key.includes("linux")) {
      // koda_change start
      const out = path.resolve("dist", `${archive}.tar.gz`)
      await $`tar -czf ${out} *`.cwd(`dist/${key}/bin`)
      archives.push(out)
      // koda_change end
    } else {
      // koda_change start
      const out = path.resolve("dist", `${archive}.zip`)
      await $`zip -r ${out} *`.cwd(`dist/${key}/bin`)
      archives.push(out)
      // koda_change end
    }
  }
  await $`gh release upload v${Script.version} ${archives} --clobber` // koda_change
}

export { binaries }
