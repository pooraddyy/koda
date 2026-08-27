import type { WorkspaceV2 } from "@opencode-ai/core/workspace" // koda_change

const disposers = new Set<(directory: string, workspaceID?: WorkspaceV2.ID) => Promise<void>>() // koda_change

// koda_change start
export function registerDisposer(
  disposer: (directory: string, workspaceID?: WorkspaceV2.ID) => Promise<void>, // koda_change
) {
  disposers.add(disposer)
  return () => {
    disposers.delete(disposer)
  }
}

export async function disposeInstance(directory: string, workspaceID?: WorkspaceV2.ID) {
  await Promise.allSettled([...disposers].map((disposer) => disposer(directory, workspaceID)))
}
// koda_change end
