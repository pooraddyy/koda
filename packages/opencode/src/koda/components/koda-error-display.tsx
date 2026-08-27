import { createMemo, Match, Switch, type JSX } from "solid-js"
import { SplitBorder } from "@tui/ui/border"
import { useTheme } from "@tui/context/theme"
import { parsekodaErrorCode, kodaErrorTitle, kodaErrorDescription } from "@/koda/koda-errors"
import type { AssistantMessage } from "@koda/sdk/v2"

interface KodaErrorBlockProps {
  error: NonNullable<AssistantMessage["error"]>
  fallback: JSX.Element
}

export function KodaErrorBlock(props: KodaErrorBlockProps) {
  const { theme } = useTheme()

  const kodaErrorCode = createMemo(() => {
    return parsekodaErrorCode(props.error)
  })

  const title = createMemo(() => {
    const code = kodaErrorCode()
    return code ? kodaErrorTitle(code) : undefined
  })

  const description = createMemo(() => {
    const code = kodaErrorCode()
    return code ? kodaErrorDescription(code) : undefined
  })

  return (
    <Switch fallback={props.fallback}>
      <Match when={kodaErrorCode()}>
        <box
          border={["left"]}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={theme.primary}
        >
          <text fg={theme.text}>{title()}</text>
          <text fg={theme.textMuted}>{description()}</text>
          <text fg={theme.primary}>{"Run /connect or `koda auth login` to connect to koda Gateway"}</text>
        </box>
      </Match>
    </Switch>
  )
}
