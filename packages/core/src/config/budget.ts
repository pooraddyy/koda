export * as ConfigBudget from "./budget"

import { Schema } from "effect"
import { NonNegativeInt } from "../schema"

const MAX_TOKENS = 10_000_000
const MAX_TASKS = 100_000
const MAX_COST = 1_000_000

export const Tokens = NonNegativeInt.check(Schema.isLessThanOrEqualTo(MAX_TOKENS))
export const Tasks = NonNegativeInt.check(Schema.isLessThanOrEqualTo(MAX_TASKS))
export const Cost = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(MAX_COST))

export const Info = Schema.Struct({
  tokens: Schema.optional(Tokens),
  cost: Schema.optional(Cost),
  tasks: Schema.optional(Tasks),
}).annotate({
  identifier: "ConfigBudget",
  description: "Bounded per-agent token, monetary, and delegated-task ceilings.",
})

export type Info = Schema.Schema.Type<typeof Info>
