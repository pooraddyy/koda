#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { NpmPublish } from "./koda/npm-publish" // koda_change

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
const npmOnly = process.argv.includes("--npm-only")
const dryRun = process.argv.includes("--dry-run")

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

const provenanceEnabled = process.env.NPM_CONFIG_PROVENANCE === "true" || process.env.GITHUB_ACTIONS === "true"
const skippedPlatforms = new Set(
  (process.env.koda_PUBLISH_SKIP_PLATFORMS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
)
const fallbackVersion = process.env.koda_PUBLISH_FALLBACK_VERSION?.trim()

async function pack(dir: string, name: string, version: string) {
  for (const file of await fs.readdir(dir)) {
    if (file.endsWith(".tgz")) await fs.rm(path.join(dir, file), { force: true })
  }
  await $`bun pm pack`.cwd(dir)
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".tgz"))
  if (files.length !== 1) throw new Error(`Expected one npm tarball for ${name}@${version}, found ${files.length}`)
  const staged = path.join(
    os.tmpdir(),
    `koda-npm-${name.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}-${version}-${Date.now()}.tgz`,
  )
  await fs.rename(path.join(dir, files[0]), staged)
  return staged
}

async function publish(dir: string, name: string, version: string) {
  if (dryRun) {
    const tarball = await pack(dir, name, version)
    await fs.rm(tarball, { force: true })
    console.log(`packed ${name}@${version}`)
    return
  }
  // GitHub artifact downloads can drop the executable bit, and Docker uses the
  // unpacked dist binaries directly rather than the published tarball.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  const tarball = await pack(dir, name, version)
  try {
    // koda_change start
    await NpmPublish.retry({
      name,
      version,
      run: () =>
        provenanceEnabled
          ? $`npm publish ${tarball} --access public --tag ${Script.channel} --provenance`.cwd(dir)
          : $`npm publish ${tarball} --access public --tag ${Script.channel}`.cwd(dir),
      exists: () => published(name, version),
    })
    // koda_change end
  } finally {
    await fs.rm(tarball, { force: true })
  }
}

const binaries: Record<string, string> = {}
// koda_change start
for (const filepath of new Bun.Glob("*/*/package.json").scanSync({ cwd: "./dist" })) {
  // koda_change end
  const packageManifest = await Bun.file(`./dist/${filepath}`).json()
  if (packageManifest.name === pkg.name) continue
  if (skippedPlatforms.has(packageManifest.name)) {
    if (!fallbackVersion) {
      throw new Error(`Missing koda_PUBLISH_FALLBACK_VERSION for skipped platform ${packageManifest.name}`)
    }
    binaries[packageManifest.name] = fallbackVersion
    continue
  }
  binaries[packageManifest.name] = packageManifest.version
}
console.log("binaries", binaries)
const version = process.env.koda_VERSION ?? Object.values(binaries).find((item) => item !== fallbackVersion)
if (!version) throw new Error("Could not determine the release version")

await $`rm -rf ./dist/${pkg.name}`
await $`mkdir -p ./dist/${pkg.name}`
await $`cp -r ./bin ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`./dist/${pkg.name}/README.md`).write(await Bun.file("./README.md").text()) // koda_change

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name, // koda_change
      bin: {
        // koda_change start
        koda: `./bin/koda`,
        // koda_change end
      },
      scripts: {
        postinstall: "node ./postinstall.mjs",
      },
      version: version,
      license: pkg.license,
      keywords: pkg.keywords, // koda_change
      private: pkg.private, // koda_change
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
      // koda_change start
      repository: {
        type: "git",
        url: "https://github.com/pooraddyy/koda",
      },
      // koda_change end
    },
    null,
    2,
  ),
)

for (const [name] of Object.entries(binaries)) {
  await publish(`./dist/${name}`, name, binaries[name])
}
await publish(`./dist/${pkg.name}`, pkg.name, version) // koda_change

if (npmOnly || dryRun) process.exit(0)

const image = "ghcr.io/pooraddyy/koda" // koda_change
const platforms = "linux/amd64,linux/arm64"
const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
const tagFlags = tags.flatMap((t) => ["-t", t])

// registries
if (!Script.preview) {
  await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`
  // Calculate SHA values
  const arm64Sha = await $`sha256sum ./dist/koda-linux-arm64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const x64Sha = await $`sha256sum ./dist/koda-linux-x64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const macX64Sha = await $`sha256sum ./dist/koda-darwin-x64.zip | cut -d' ' -f1`.text().then((x) => x.trim())
  const macArm64Sha = await $`sha256sum ./dist/koda-darwin-arm64.zip | cut -d' ' -f1`.text().then((x) => x.trim())

  const [pkgver, _subver = ""] = Script.version.split(/(-.*)/, 2)

  // arch
  const binaryPkgbuild = [
    "# Maintainer: koda", // koda_change
    "",
    "pkgname='koda-bin'",
    `pkgver=${pkgver}`,
    `_subver=${_subver}`,
    "options=('!debug' '!strip')",
    "pkgrel=1",
    "pkgdesc='The AI coding agent built for the terminal.'",
    "url='https://github.com/pooraddyy/koda'",
    "arch=('aarch64' 'x86_64')",
    "license=('MIT' 'LGPL-2.0-or-later')", // koda_change
    "provides=('koda')",
    "conflicts=('koda')",
    "depends=('ripgrep')",
    "",
    `source_aarch64=("\${pkgname}_\${pkgver}_aarch64.tar.gz::https://github.com/pooraddyy/koda/releases/download/v\${pkgver}\${_subver}/koda-linux-arm64.tar.gz")`,
    `sha256sums_aarch64=('${arm64Sha}')`,

    `source_x86_64=("\${pkgname}_\${pkgver}_x86_64.tar.gz::https://github.com/pooraddyy/koda/releases/download/v\${pkgver}\${_subver}/koda-linux-x64.tar.gz")`,
    `sha256sums_x86_64=('${x64Sha}')`,
    "",
    "package() {",
    '  install -Dm755 ./koda "${pkgdir}/usr/lib/koda/koda"', // koda_change
    '  install -Dm755 ./bwrap "${pkgdir}/usr/lib/koda/bwrap"', // koda_change
    '  install -Dm644 ./koda-sandbox-mutation-worker.js "${pkgdir}/usr/lib/koda/koda-sandbox-mutation-worker.js"', // koda_change
    '  install -dm755 "${pkgdir}/usr/bin" "${pkgdir}/usr/lib/koda/tree-sitter" "${pkgdir}/usr/share/licenses/koda"', // koda_change
    '  cp -r ./tree-sitter/. "${pkgdir}/usr/lib/koda/tree-sitter/"', // koda_change
    '  cp -r ./licenses/. "${pkgdir}/usr/share/licenses/koda/"', // koda_change
    "  printf '%s\\n' '#!/bin/sh' 'export koda_TREE_SITTER_WASM_DIR=/usr/lib/koda/tree-sitter' 'exec /usr/lib/koda/koda \"$@\"' > \"${pkgdir}/usr/bin/koda\"", // koda_change
    '  chmod 755 "${pkgdir}/usr/bin/koda"', // koda_change
    "}",
    "",
  ].join("\n")

  for (const [pkg, pkgbuild] of [["koda-bin", binaryPkgbuild]]) {
    for (let i = 0; i < 30; i++) {
      try {
        await $`rm -rf ./dist/aur-${pkg}`
        await $`git clone ssh://aur@aur.archlinux.org/${pkg}.git ./dist/aur-${pkg}`
        await $`cd ./dist/aur-${pkg} && git checkout master`
        await Bun.file(`./dist/aur-${pkg}/PKGBUILD`).write(pkgbuild)
        await $`cd ./dist/aur-${pkg} && makepkg --printsrcinfo > .SRCINFO`
        await $`cd ./dist/aur-${pkg} && git add PKGBUILD .SRCINFO`
        if ((await $`cd ./dist/aur-${pkg} && git diff --cached --quiet`.nothrow()).exitCode === 0) break
        await $`cd ./dist/aur-${pkg} && git commit -m "Update to v${Script.version}"`
        await $`cd ./dist/aur-${pkg} && git push`
        break
      } catch {
        continue
      }
    }
  }

  // Homebrew formula
  const homebrewFormula = [
    "# typed: false",
    "# frozen_string_literal: true",
    "",
    "# This file was generated by GoReleaser. DO NOT EDIT.",
    "class koda < Formula", // koda_change
    `  desc "The AI coding agent built for the terminal."`,
    `  homepage "https://koda.ai"`, // koda_change
    `  version "${Script.version.split("-")[0]}"`,
    "",
    `  depends_on "ripgrep"`,
    "",
    "  on_macos do",
    "    if Hardware::CPU.intel?",
    `      url "https://github.com/pooraddyy/koda/releases/download/v${Script.version}/koda-darwin-x64.zip"`,
    `      sha256 "${macX64Sha}"`,
    "",
    "      def install",
    '        libexec.install "koda", "koda-sandbox-mutation-worker.js", "tree-sitter"', // koda_change
    '        (bin/"koda").write_env_script libexec/"koda", koda_TREE_SITTER_WASM_DIR: libexec/"tree-sitter"', // koda_change
    "      end",
    "    end",
    "    if Hardware::CPU.arm?",
    `      url "https://github.com/pooraddyy/koda/releases/download/v${Script.version}/koda-darwin-arm64.zip"`,
    `      sha256 "${macArm64Sha}"`,
    "",
    "      def install",
    '        libexec.install "koda", "koda-sandbox-mutation-worker.js", "tree-sitter"', // koda_change
    '        (bin/"koda").write_env_script libexec/"koda", koda_TREE_SITTER_WASM_DIR: libexec/"tree-sitter"', // koda_change
    "      end",
    "    end",
    "  end",
    "",
    "  on_linux do",
    "    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/pooraddyy/koda/releases/download/v${Script.version}/koda-linux-x64.tar.gz"`,
    `      sha256 "${x64Sha}"`,
    "      def install",
    '        libexec.install "koda", "bwrap", "koda-sandbox-mutation-worker.js", "tree-sitter", "licenses"', // koda_change
    '        (bin/"koda").write_env_script libexec/"koda", koda_TREE_SITTER_WASM_DIR: libexec/"tree-sitter"', // koda_change
    "      end",
    "    end",
    "    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/pooraddyy/koda/releases/download/v${Script.version}/koda-linux-arm64.tar.gz"`,
    `      sha256 "${arm64Sha}"`,
    "      def install",
    '        libexec.install "koda", "bwrap", "koda-sandbox-mutation-worker.js", "tree-sitter", "licenses"', // koda_change
    '        (bin/"koda").write_env_script libexec/"koda", koda_TREE_SITTER_WASM_DIR: libexec/"tree-sitter"', // koda_change
    "      end",
    "    end",
    "  end",
    "end",
    "",
    "",
  ].join("\n")

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error("GITHUB_TOKEN is required to update homebrew tap")
    process.exit(1)
  }
  const tap = `https://x-access-token:${token}@github.com/pooraddyy/homebrew-tap.git` // koda_change
  await $`rm -rf ./dist/homebrew-tap`
  await $`git clone ${tap} ./dist/homebrew-tap`
  await Bun.file("./dist/homebrew-tap/koda.rb").write(homebrewFormula) // koda_change
  await $`cd ./dist/homebrew-tap && git add koda.rb` // koda_change
  if ((await $`cd ./dist/homebrew-tap && git diff --cached --quiet`.nothrow()).exitCode !== 0) {
    await $`cd ./dist/homebrew-tap && git commit -m "Update to v${Script.version}"`
    await $`cd ./dist/homebrew-tap && git push`
  }
}
