type Release = {
  tagName: string
  isPrerelease: boolean
  isDraft: boolean
}

type BuildNotesOptions = {
  version: string
  prerelease: boolean
  releases: Release[]
  changelog: string
}

type ChangelogSection = {
  version: string
  body: string
}

const VERSION_PREFIX = /^v/

function normalizeVersion(version: string) {
  return version.replace(VERSION_PREFIX, "")
}

function parseSections(changelog: string): ChangelogSection[] {
  const matches = [...changelog.matchAll(/^##\s+([^\n]+)\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/gm)]
  return matches.map((match) => ({
    version: normalizeVersion(match[1]!.trim()),
    body: match[2]!.trim(),
  }))
}

function publishedPrereleaseVersions(releases: Release[]) {
  return new Set(
    releases
      .filter((release) => release.isPrerelease && !release.isDraft)
      .map((release) => normalizeVersion(release.tagName)),
  )
}

function formatSections(sections: ChangelogSection[]) {
  const meaningful = sections.filter((section) => section.body.length > 0)
  if (meaningful.length === 0) return "No notable changes"
  return meaningful.map((section) => `## ${section.version}\n\n${section.body}`).join("\n\n")
}

export function buildNotes({ version, prerelease, releases, changelog }: BuildNotesOptions) {
  const sections = parseSections(changelog)
  const currentVersion = normalizeVersion(version)

  if (prerelease) {
    const current = sections.find((section) => section.version === currentVersion)
    return current?.body || "No notable changes"
  }

  const previousStable = releases
    .filter((release) => !release.isPrerelease && !release.isDraft)
    .map((release) => normalizeVersion(release.tagName))[0]
  const publishedPrereleases = publishedPrereleaseVersions(releases)
  const currentIndex = sections.findIndex((section) => section.version === currentVersion)
  const start = currentIndex < 0 ? 0 : currentIndex
  const selected: ChangelogSection[] = []

  for (const section of sections.slice(start)) {
    if (section.version === previousStable) break
    if (section.version === currentVersion || publishedPrereleases.has(section.version)) selected.push(section)
  }

  return formatSections(selected)
}
