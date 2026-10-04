import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@koda-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~koda/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~koda/WorkspaceRef", {
  defaultValue: () => undefined,
})
