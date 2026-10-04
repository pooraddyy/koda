/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeKodaContent from "./skill/customize-koda.md" with { type: "text" }

export const CustomizeKodaContent = customizeKodaContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-koda",
            description:
              "Use ONLY when the user is editing or creating koda's own configuration: koda.json, koda.jsonc, files under .koda/, or files under ~/.config/koda/. Also use when creating or fixing koda agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring koda itself.",
            location: AbsolutePath.make("/builtin/customize-koda.md"),
            content: CustomizeKodaContent,
          }),
        }),
      )
    })
  }),
})
