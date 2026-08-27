export const Npm = {
  name: "@koda-code/cli",
  path: "@koda-code%2fcli",
}

export const Brew = {
  name: "koda",
  tap: "koda-Org/tap",
  formula: "koda-Org/tap/koda",
  api: "https://formulae.brew.sh/api/formula/koda.json",
}

export const Choco = {
  name: "koda",
  api: "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27koda%27%20and%20IsLatestVersion&$select=Version",
}

export const Scoop = {
  name: "koda",
  manifest: "https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/koda.json",
}

export const Release = {
  install: "https://raw.githubusercontent.com/pooraddyy/koda/main/install.sh",
}
