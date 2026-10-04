export * as File from "./file"

import { Revert } from "@koda-ai/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
