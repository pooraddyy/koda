export const CHAT_ACTIVITY_STAGES = [
  "Thinking through the request",
  "Mapping the workspace",
  "Choosing the next move",
  "Working through the change",
  "Checking the result",
  "Shaping the response",
] as const

export function nextChatActivityIndex(index: number): number {
  const current = Number.isFinite(index) ? Math.trunc(index) : 0
  return (current + 1) % CHAT_ACTIVITY_STAGES.length
}

export function chatActivityLabel(index: number): string {
  const current = Number.isFinite(index) ? Math.trunc(index) : 0
  const normalized =
    ((current % CHAT_ACTIVITY_STAGES.length) + CHAT_ACTIVITY_STAGES.length) % CHAT_ACTIVITY_STAGES.length
  return CHAT_ACTIVITY_STAGES[normalized]
}
