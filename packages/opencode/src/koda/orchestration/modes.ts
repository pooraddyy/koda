import type { GraphNodeInput } from "./graph"

export type CollaborationModeName = "focused" | "parallel" | "review" | "thorough"

export type CollaborationMode = {
  readonly name: CollaborationModeName
  readonly description: string
  readonly maxNodes: number
  readonly maxConcurrency: number
  readonly retries: number
  readonly allowMutationParallelism: boolean
}

export const COLLABORATION_MODES: Record<CollaborationModeName, CollaborationMode> = {
  focused: {
    name: "focused",
    description: "One read-only investigation followed by one implementation and verification pass.",
    maxNodes: 4,
    maxConcurrency: 2,
    retries: 1,
    allowMutationParallelism: false,
  },
  parallel: {
    name: "parallel",
    description: "Parallel discovery and risk analysis followed by a dependent implementation review.",
    maxNodes: 5,
    maxConcurrency: 3,
    retries: 1,
    allowMutationParallelism: false,
  },
  review: {
    name: "review",
    description: "Parallel correctness and security review with a final findings synthesis.",
    maxNodes: 4,
    maxConcurrency: 3,
    retries: 1,
    allowMutationParallelism: false,
  },
  thorough: {
    name: "thorough",
    description: "Full discovery, architecture, implementation, verification, and review pipeline.",
    maxNodes: 6,
    maxConcurrency: 3,
    retries: 2,
    allowMutationParallelism: false,
  },
}

function safePrompt(request: string, role: string, requirements: string) {
  return [
    `You are the ${role} worker in a Koda collaboration graph.`,
    "Stay within your assigned scope and do not duplicate other workers.",
    requirements,
    `Original request:\n${request}`,
    "Return concise evidence, exact paths, and actionable next steps for the coordinator.",
  ].join("\n\n")
}

export function planCollaboration(mode: CollaborationModeName, request: string): readonly GraphNodeInput[] {
  switch (mode) {
    case "review":
      return [
        {
          id: "correctness-review",
          role: "reviewer",
          prompt: safePrompt(
            request,
            "correctness reviewer",
            "Check behavior, edge cases, regressions, and test coverage. Do not edit files.",
          ),
        },
        {
          id: "security-review",
          role: "reviewer",
          prompt: safePrompt(
            request,
            "security reviewer",
            "Check trust boundaries, secrets, permissions, injection risks, and unsafe process/file operations. Do not edit files.",
          ),
        },
        {
          id: "review-synthesis",
          role: "reviewer",
          dependsOn: ["correctness-review", "security-review"],
          prompt: safePrompt(
            request,
            "review lead",
            "Synthesize the two review reports into prioritized findings. Do not edit files.",
          ),
        },
      ]
    case "parallel":
      return [
        {
          id: "workspace-scout",
          role: "scout",
          prompt: safePrompt(
            request,
            "workspace scout",
            "Map relevant files, entrypoints, tests, and existing patterns. Do not edit files.",
          ),
        },
        {
          id: "risk-analyst",
          role: "architect",
          prompt: safePrompt(
            request,
            "risk analyst",
            "Identify design constraints, failure modes, compatibility risks, and security concerns. Do not edit files.",
          ),
        },
        {
          id: "implementation",
          role: "builder",
          dependsOn: ["workspace-scout", "risk-analyst"],
          mutation: true,
          prompt: safePrompt(
            request,
            "implementation worker",
            "Implement the requested change using the gathered evidence. Keep the diff focused and run targeted checks.",
          ),
        },
        {
          id: "verification",
          role: "verifier",
          dependsOn: ["implementation"],
          prompt: safePrompt(
            request,
            "verification worker",
            "Inspect the implementation result and run focused tests. Do not make unrelated edits.",
          ),
        },
      ]
    case "thorough":
      return [
        {
          id: "workspace-scout",
          role: "scout",
          prompt: safePrompt(
            request,
            "workspace scout",
            "Map relevant files, entrypoints, dependencies, and tests. Do not edit files.",
          ),
        },
        {
          id: "architecture",
          role: "architect",
          prompt: safePrompt(
            request,
            "architect",
            "Develop a decision-complete implementation plan and list compatibility constraints. Do not edit files.",
          ),
        },
        {
          id: "implementation",
          role: "builder",
          dependsOn: ["workspace-scout", "architecture"],
          mutation: true,
          prompt: safePrompt(
            request,
            "implementation worker",
            "Implement the requested change with focused edits and targeted tests.",
          ),
        },
        {
          id: "verification",
          role: "verifier",
          dependsOn: ["implementation"],
          prompt: safePrompt(
            request,
            "verification worker",
            "Run focused tests, type checks, and runtime checks for the implementation. Do not edit files.",
          ),
        },
        {
          id: "security-review",
          role: "reviewer",
          dependsOn: ["implementation"],
          prompt: safePrompt(
            request,
            "security reviewer",
            "Audit the final diff for trust-boundary, secret, permission, and process risks. Do not edit files.",
          ),
        },
        {
          id: "final-synthesis",
          role: "reviewer",
          dependsOn: ["verification", "security-review"],
          prompt: safePrompt(
            request,
            "release lead",
            "Summarize implementation, tests, remaining risks, and release recommendation. Do not edit files.",
          ),
        },
      ]
    case "focused":
    default:
      return [
        {
          id: "workspace-scout",
          role: "scout",
          prompt: safePrompt(
            request,
            "workspace scout",
            "Find the smallest safe implementation surface and relevant tests. Do not edit files.",
          ),
        },
        {
          id: "implementation",
          role: "builder",
          dependsOn: ["workspace-scout"],
          mutation: true,
          prompt: safePrompt(
            request,
            "implementation worker",
            "Implement the requested change and keep the diff focused.",
          ),
        },
        {
          id: "verification",
          role: "verifier",
          dependsOn: ["implementation"],
          prompt: safePrompt(
            request,
            "verification worker",
            "Run focused tests and report any regression. Do not make unrelated edits.",
          ),
        },
      ]
  }
}
