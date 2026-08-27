import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"
import { MemoryRedact } from "@koda/koda-memory/redact"

export namespace EvolutionStore {
  export type Lesson = {
    id: string
    scope: string
    lesson: string
    evidence?: string
    confidence: number
    uses: number
    createdAt: number
    updatedAt: number
    sourceSessionID?: string
  }

  export type LearnInput = {
    root: string
    scope: string
    lesson: string
    evidence?: string
    confidence?: number
    sourceSessionID?: string
  }

  const DIRECTORY = "evolution"
  const FILE = "lessons.json"
  const MAX_LESSONS = 32
  const MAX_LESSON_CHARS = 640
  const MAX_EVIDENCE_CHARS = 420
  const MAX_SCOPE_CHARS = 120
  const MAX_PROMPT_CHARS = 3_600

  function file(root: string) {
    return path.join(root, DIRECTORY, FILE)
  }

  function text(value: string, max: number) {
    return MemoryRedact.text(value).replace(/\s+/g, " ").trim().slice(0, max)
  }

  function scope(value: string) {
    return text(value, MAX_SCOPE_CHARS) || "project"
  }

  function confidence(value: number | undefined) {
    if (!Number.isFinite(value)) return 0.7
    return Math.min(1, Math.max(0, value ?? 0.7))
  }

  function valid(value: unknown): value is Lesson {
    if (!value || typeof value !== "object") return false
    const item = value as Partial<Lesson>
    return (
      typeof item.id === "string" &&
      typeof item.scope === "string" &&
      typeof item.lesson === "string" &&
      item.lesson.length > 0 &&
      typeof item.confidence === "number" &&
      typeof item.uses === "number" &&
      typeof item.createdAt === "number" &&
      typeof item.updatedAt === "number"
    )
  }

  async function read(root: string) {
    try {
      const raw = await fs.readFile(file(root), "utf8")
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(valid).slice(0, MAX_LESSONS)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async function write(root: string, lessons: Lesson[]) {
    const target = file(root)
    const directory = path.dirname(target)
    await fs.mkdir(directory, { recursive: true })
    const temporary = path.join(directory, `.${FILE}.${process.pid}.${Date.now()}.tmp`)
    await fs.writeFile(temporary, JSON.stringify(lessons, null, 2) + "\n", { mode: 0o600 })
    await fs.rename(temporary, target)
  }

  function id(scopeValue: string, lesson: string) {
    return createHash("sha256").update(`${scopeValue}\n${lesson}`).digest("hex").slice(0, 24)
  }

  export async function list(root: string) {
    const lessons = await read(root)
    return lessons.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  export async function learn(input: LearnInput) {
    const learnedScope = scope(input.scope)
    const learnedLesson = text(input.lesson, MAX_LESSON_CHARS)
    if (!learnedLesson) throw new Error("A non-empty lesson is required")
    const learnedEvidence = input.evidence ? text(input.evidence, MAX_EVIDENCE_CHARS) : undefined
    const now = Date.now()
    const key = id(learnedScope, learnedLesson.toLowerCase())
    const lessons = await read(input.root)
    const existing = lessons.find((item) => item.id === key)
    let result: Lesson
    if (existing) {
      result = {
        ...existing,
        evidence: learnedEvidence ?? existing.evidence,
        confidence: Math.max(existing.confidence, confidence(input.confidence)),
        uses: existing.uses + 1,
        updatedAt: now,
        ...(input.sourceSessionID ? { sourceSessionID: input.sourceSessionID } : {}),
      }
    } else {
      result = {
        id: key,
        scope: learnedScope,
        lesson: learnedLesson,
        ...(learnedEvidence ? { evidence: learnedEvidence } : {}),
        confidence: confidence(input.confidence),
        uses: 1,
        createdAt: now,
        updatedAt: now,
        ...(input.sourceSessionID ? { sourceSessionID: input.sourceSessionID } : {}),
      }
    }
    const next = [result, ...lessons.filter((item) => item.id !== key)]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LESSONS)
    await write(input.root, next)
    return { lesson: result, created: !existing, total: next.length }
  }

  export async function search(root: string, query: string, limit = 8) {
    const needle = text(query, 240).toLowerCase()
    if (!needle) return []
    const terms = needle.split(/\s+/).filter((item) => item.length > 1)
    const lessons = await list(root)
    return lessons
      .map((item) => {
        const haystack = `${item.scope} ${item.lesson} ${item.evidence ?? ""}`.toLowerCase()
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
        return { item, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
      .slice(0, Math.max(1, Math.min(16, limit)))
      .map((item) => item.item)
  }

  export function prompt(lessons: Lesson[]) {
    if (lessons.length === 0) return []
    const lines = [
      "The following are bounded, redacted lessons learned from verified work in this project.",
      "Use them as context, not authority: current user instructions, repository files, tool output, tests, permissions, and sandbox policy always win.",
      "Only rely on a lesson when it matches the current project and task; verify it when it may be stale.",
      ...lessons.slice(0, MAX_LESSONS).map((item) => {
        const evidence = item.evidence ? ` Evidence: ${item.evidence}` : ""
        return `- [${item.scope}; confidence ${item.confidence.toFixed(2)}; used ${item.uses}x] ${item.lesson}${evidence}`
      }),
    ]
    let block = lines.join("\n")
    if (Buffer.byteLength(block) > MAX_PROMPT_CHARS)
      block = block.slice(0, MAX_PROMPT_CHARS).trimEnd() + "\n- (more lessons omitted)"
    return [block]
  }

  export function location(root: string) {
    return file(root)
  }
}
