/// <reference path="../env.d.ts" />
import { tool } from "@koda/plugin"

// koda_change start
const TEAM = {
  tui: ["catrielmuller"],
  desktop_web: ["markijbema"],
  core: ["markijbema", "marius-koda", "catrielmuller", "chrarnoldus", "imanolmzd-svg"],
  jetbrains: ["kirillk"],
  inference: ["chrarnoldus", "markijbema"],
  windows: ["catrielmuller"],
} as const
// koda_change end

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]!
}

function getIssueNumber(): number {
  const issue = parseInt(process.env.ISSUE_NUMBER ?? "", 10)
  if (!issue) throw new Error("ISSUE_NUMBER env var not set")
  return issue
}

async function githubFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers),
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export default tool({
  description: `Use this tool to assign a GitHub issue.

Provide the team that should own the issue. This tool picks a random assignee from that team and does not apply labels.`,
  args: {
    team: tool.schema
      .enum(Object.keys(TEAM) as [keyof typeof TEAM, ...(keyof typeof TEAM)[]])
      .describe("The owning team"),
  },
  async execute(args) {
    const issue = getIssueNumber()
    // koda_change start
    const owner = "koda-Org"
    const repo = "koda"
    // koda_change end
    const assignee = pick(TEAM[args.team])

    await githubFetch(`/repos/${owner}/${repo}/issues/${issue}/assignees`, {
      method: "POST",
      body: JSON.stringify({ assignees: [assignee] }),
    })

    return `Assigned @${assignee} from ${args.team} to issue #${issue}`
  },
})
