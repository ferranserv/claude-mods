import type { PlanPhase, PlanSnap, PlanTask } from '../types'

export const PHASES: readonly PlanPhase[] = ['researching', 'planning', 'building', 'testing', 'auditing']

export const EMPTY: PlanSnap = {
  goal: '',
  isGoalCmd: false,
  tasks: [],
  phase: 'researching',
  visited: [],
  startedAt: 0,
  endedAt: 0,
  isRunning: false,
}

export type Ctx = { now: number; promptAt: number; promptText: string }

const TEST = /\b(test|tests|pytest|jest|vitest|mocha|tsc|typecheck|lint|eslint|ruff|mypy|clippy|validate|cargo (test|check)|go (test|vet)|npm run (test|lint|build|check))\b/i
const AUDIT = /review|audit|security|simplify|verify|critique/i

/** `TaskCreate`, `task_create`, `Task-Create` all read the same. */
export const norm = (tool: string): string => tool.toLowerCase().replace(/[^a-z]/g, '')

const statusOf = (v: unknown): PlanTask['status'] => {
  const n = typeof v === 'string' ? norm(v) : ''
  if (n === 'completed' || n === 'complete' || n === 'done') return 'completed'
  if (n === 'inprogress' || n === 'active' || n === 'doing' || n === 'started') return 'in_progress'
  return 'pending'
}

export const firstLine = (text: string): string => text.trim().split('\n')[0]?.trim() ?? ''

/** A prompt without the app's own wrappers (<system-reminder>, <command-name>, ...), which are not the user's words. */
export function cleanPrompt(text: string): string {
  return text
    .replace(/<([a-z][a-z-]*)>[\s\S]*?<\/\1>/gi, '')
    .split('\n')
    .filter(l => !/^\s*<\/?[a-z][a-z-]*>\s*$/i.test(l))
    .join('\n')
}

/** The goal a prompt states: its first real line. */
export const goalOf = (text: string): string => clip(firstLine(cleanPrompt(text)), 200)

export const clip = (text: string, width: number): string =>
  text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'

export const fmtTime = (ms: number): string => {
  const t = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export const isAllDone = (s: PlanSnap): boolean =>
  s.tasks.length > 0 && s.tasks.every(t => t.status === 'completed')

export const isActive = (s: PlanSnap): boolean => s.goal !== '' || s.tasks.length > 0

/** The phase a task's wording implies, so a checklist step moves the phase the moment it starts. */
export function phaseFromSubject(subject: string): PlanPhase | undefined {
  if (AUDIT.test(subject)) return 'auditing'
  if (/\b(test|tests|verify|validate|lint|typecheck)\b/i.test(subject)) return 'testing'
  if (/\b(research|investigate|explore|find|read|inspect|check|analy[sz]e)\b/i.test(subject)) return 'researching'
  if (/\b(plan|design|outline|decide|scope)\b/i.test(subject)) return 'planning'
  if (/\b(build|implement|write|add|create|fix|update|refactor|edit|wire|install)\b/i.test(subject)) return 'building'
  return undefined
}

/** The phase one tool call implies; reads never pull a build, test or audit back to researching. */
export function toolPhase(tool: string, input: Record<string, unknown>, current: PlanPhase): PlanPhase | undefined {
  const str = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (norm(tool)) {
    case 'read':
    case 'grep':
    case 'glob':
    case 'websearch':
    case 'webfetch':
      return current === 'building' || current === 'testing' || current === 'auditing' ? undefined : 'researching'
    case 'enterplanmode':
    case 'exitplanmode':
    case 'taskcreate':
    case 'createtask':
    case 'todowrite':
    case 'writetodos':
    case 'updateplan':
      return 'planning'
    case 'edit':
    case 'write':
    case 'notebookedit':
    case 'multiedit':
    case 'applypatch':
      return 'building'
    case 'bash':
    case 'shell':
      return TEST.test(str('command')) ? 'testing' : undefined
    case 'skill':
      return AUDIT.test(str('skill')) ? 'auditing' : undefined
    case 'agent':
    case 'task':
      return AUDIT.test(`${str('subagent_type')} ${str('description')}`) ? 'auditing' : undefined
    default:
      return undefined
  }
}

const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

function startIfNew(s: PlanSnap, ctx: Ctx): PlanSnap {
  if (s.startedAt !== 0) return s
  return { ...s, startedAt: ctx.promptAt || ctx.now, goal: s.goal || goalOf(ctx.promptText), isRunning: true }
}

/**
 * Marks every phase up to the furthest one reached as visited: moving on from a phase reads as done, and one
 * skipped on the way (research straight to building) is done too.
 */
export function withVisited(s: PlanSnap): PlanSnap {
  const far = Math.max(PHASES.indexOf(s.phase), ...s.visited.map(p => PHASES.indexOf(p)))
  const visited = PHASES.slice(0, far + 1)
  return visited.length === s.visited.length ? s : { ...s, visited }
}

const SUBJECT_KEYS = ['step', 'content', 'subject', 'title', 'task', 'text', 'name', 'description', 'activeForm']

/**
 * The task list inside a tool call whatever it is called: the first array of objects that each carry some
 * text and a status. Covers TodoWrite ({ todos }), update_plan ({ plan }) and shapes not seen yet.
 */
export function extractList(input: Record<string, unknown>): PlanTask[] | undefined {
  for (const value of Object.values(input)) {
    if (!Array.isArray(value) || value.length === 0) continue
    const items = value.map(rec)
    if (!items.every(t => 'status' in t && SUBJECT_KEYS.some(k => typeof t[k] === 'string'))) continue
    return items.map((t, i) => {
      const subject = SUBJECT_KEYS.map(k => t[k]).find(v => typeof v === 'string' && v.trim() !== '')
      return { id: String(i + 1), subject: typeof subject === 'string' ? subject : `Step ${i + 1}`, status: statusOf(t.status) }
    })
  }
  return undefined
}

/** The id a TaskCreate result carries: { task: { id } }, { id }, or the text "Task #7 created successfully". */
export function taskIdOf(result: unknown): string | undefined {
  const r = rec(result)
  for (const v of [rec(r.task).id, r.id, r.taskId]) if (typeof v === 'string' || typeof v === 'number') return String(v)
  const text = typeof result === 'string' ? result : typeof r.text === 'string' ? r.text : typeof r.content === 'string' ? r.content : ''
  return /Task\s*#(\w+)/i.exec(text)?.[1] ?? /"id"\s*:\s*"?(\w+)/.exec(text)?.[1]
}

/** Folds one finished tool call into the snapshot; unknown tools return `s` itself. */
export function applyTool(s: PlanSnap, tool: string, input: Record<string, unknown>, result: unknown, ctx: Ctx): PlanSnap {
  const next = applyToolInner(s, tool, input, result, ctx)
  return next === s ? s : withVisited(next)
}

function applyToolInner(s: PlanSnap, tool: string, input: Record<string, unknown>, result: unknown, ctx: Ctx): PlanSnap {
  const name = norm(tool)
  const text = (...keys: string[]): string | undefined => {
    for (const k of keys) if (typeof input[k] === 'string' && (input[k] as string).trim() !== '') return input[k] as string
    return undefined
  }

  if (name === 'proposegoal' && typeof input.condition === 'string') {
    return { ...s, goal: clip(input.condition, 200), isGoalCmd: true, startedAt: s.startedAt || ctx.now, isRunning: true }
  }

  if (name === 'taskcreate' || name === 'createtask') {
    const subjectIn = text('subject', 'title', 'content', 'name')
    if (subjectIn === undefined) return s
    const task = rec(rec(result).task)
    const id = taskIdOf(result) ?? String(s.tasks.length + 1)
    const subject = typeof task.subject === 'string' ? task.subject : subjectIn
    const next: PlanTask = { id, subject, status: 'pending' }
    return startIfNew({ ...s, tasks: [...s.tasks.filter(t => t.id !== id), next] }, ctx)
  }

  if (name === 'taskupdate' || name === 'updatetask') {
    const raw = input.taskId ?? input.id ?? input.task_id
    if (typeof raw !== 'string' && typeof raw !== 'number') return s
    const id = String(raw)
    if (!s.tasks.some(t => t.id === id)) return s
    if (typeof input.status === 'string' && norm(input.status) === 'deleted') return { ...s, tasks: s.tasks.filter(t => t.id !== id) }
    const status = typeof input.status === 'string' ? statusOf(input.status) : undefined
    const renamed = text('subject', 'title', 'content')
    const at = s.tasks.findIndex(t => t.id === id)
    // Starting a step means the ones before it that were still running are finished.
    const tasks = s.tasks.map((t, i) =>
      t.id === id
        ? { ...t, status: status ?? t.status, subject: renamed ?? t.subject }
        : status === 'in_progress' && i < at && t.status === 'in_progress' ? { ...t, status: 'completed' as const } : t,
    )
    const started = status === 'in_progress' ? tasks.find(t => t.id === id) : undefined
    const phase = (started && phaseFromSubject(started.subject)) || s.phase
    return { ...s, tasks, phase }
  }

  // The whole list at once: TodoWrite ({ todos }), update_plan ({ plan }) and any tool with a plan, todo or
  // task in its name that carries a list of { text, status } objects.
  if (/todo|plan|task|step/.test(name)) {
    const tasks = extractList(input)
    if (tasks) {
      const active = tasks.find(t => t.status === 'in_progress')
      const phase = (active && phaseFromSubject(active.subject)) || s.phase
      return startIfNew({ ...s, tasks, phase }, ctx)
    }
  }

  return s
}

export function applyPrompt(s: PlanSnap, ctx: Ctx): PlanSnap {
  if (!isActive(s)) return s
  if (isAllDone(s) && !s.isGoalCmd) return EMPTY
  return { ...s, isRunning: true, endedAt: 0 }
}

export function applyGoalCommand(s: PlanSnap, args: string, ctx: Ctx): PlanSnap {
  const text = args.trim()
  if (text === '') return s
  if (/^(clear|off|stop|cancel)$/i.test(text)) return EMPTY
  return { ...s, goal: goalOf(text), isGoalCmd: true, startedAt: s.startedAt || ctx.now, endedAt: 0, isRunning: true }
}

/** Any new main-loop turn (a goal's continuation, a hook's re-prompt) makes the clock run again. */
export function applyTurnStart(s: PlanSnap): PlanSnap {
  return isActive(s) && !s.isRunning ? { ...s, isRunning: true, endedAt: 0 } : s
}

export function applyTurnEnd(s: PlanSnap, now: number): PlanSnap {
  return isActive(s) ? { ...s, isRunning: false, endedAt: now } : s
}

/** The slice of the checklist that fits `rows`, kept around the first unfinished step. */
export function windowTasks(tasks: readonly PlanTask[], rows: number): { shown: PlanTask[]; hidden: number } {
  if (tasks.length <= rows) return { shown: [...tasks], hidden: 0 }
  const room = Math.max(1, rows - 1)
  const at = tasks.findIndex(t => t.status !== 'completed')
  const focus = at === -1 ? tasks.length - 1 : at
  const start = Math.max(0, Math.min(focus - 1, tasks.length - room))
  return { shown: tasks.slice(start, start + room), hidden: tasks.length - room }
}

/** Done steps count in full, the one running counts half, so the bar moves while a step is under way. */
export const percent = (s: PlanSnap): number => {
  if (s.tasks.length === 0) return 0
  const done = s.tasks.filter(t => t.status === 'completed').length
  const running = s.tasks.filter(t => t.status === 'in_progress').length
  return Math.min(100, Math.round(((done + running * 0.5) / s.tasks.length) * 100))
}

export const isTaskTool = (tool: string): boolean => /todo|plan|task|step/.test(norm(tool))

/** What to tell the model when the checklist has gone stale: `calls` tool calls since a task tool ran. */
export function nudgeNote(s: PlanSnap, calls: number, after: number): string | undefined {
  if (s.tasks.length === 0 || isAllDone(s) || calls < after) return undefined
  const done = s.tasks.filter(t => t.status === 'completed').length
  const now = s.tasks.find(t => t.status === 'in_progress')
  const state = now ? `"${clip(firstLine(now.subject), 60)}" (#${now.id}) is marked in progress` : 'no step is marked in progress'
  return `Plan Progress: ${done}/${s.tasks.length} checklist steps are done and ${state}. The user watches this checklist. If a step is finished, mark it completed now with the task tool, and mark the next one in progress.`
}

export const bar = (pct: number, width: number): string => {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
