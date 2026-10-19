import type { PlanPhase, PlanSnap, PlanTask } from '../types'

export const PHASES: readonly PlanPhase[] = ['researching', 'planning', 'building', 'testing', 'auditing']

export const EMPTY: PlanSnap = {
  goal: '',
  isGoalCmd: false,
  tasks: [],
  phase: 'researching',
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
  return { ...s, startedAt: ctx.promptAt || ctx.now, goal: s.goal || clip(firstLine(ctx.promptText), 200), isRunning: true }
}

/** Folds one finished tool call into the snapshot; unknown tools return `s` itself. */
export function applyTool(s: PlanSnap, tool: string, input: Record<string, unknown>, result: unknown, ctx: Ctx): PlanSnap {
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
    const id = typeof task.id === 'string' || typeof task.id === 'number' ? String(task.id) : String(s.tasks.length + 1)
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
    const tasks = s.tasks.map(t => (t.id === id ? { ...t, status: status ?? t.status, subject: renamed ?? t.subject } : t))
    const started = status === 'in_progress' ? tasks.find(t => t.id === id) : undefined
    const phase = (started && phaseFromSubject(started.subject)) || s.phase
    return { ...s, tasks, phase }
  }

  // The whole list at once: Claude Code's TodoWrite ({ todos: [{ content, status }] }) and the
  // update_plan shape other agents use ({ plan: [{ step, status }] }).
  const list = name === 'todowrite' || name === 'writetodos' ? input.todos : name === 'updateplan' ? input.plan : undefined
  if (Array.isArray(list)) {
    const tasks: PlanTask[] = list.map((raw, i) => {
      const t = rec(raw)
      const subject = [t.content, t.step, t.subject, t.title].find(v => typeof v === 'string' && v.trim() !== '')
      return { id: String(i + 1), subject: typeof subject === 'string' ? subject : `Step ${i + 1}`, status: statusOf(t.status) }
    })
    const active = tasks.find(t => t.status === 'in_progress')
    const phase = (active && phaseFromSubject(active.subject)) || s.phase
    return startIfNew({ ...s, tasks, phase }, ctx)
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
  return { ...s, goal: clip(firstLine(text), 200), isGoalCmd: true, startedAt: s.startedAt || ctx.now, endedAt: 0, isRunning: true }
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

export const percent = (s: PlanSnap): number =>
  s.tasks.length === 0 ? 0 : Math.round((s.tasks.filter(t => t.status === 'completed').length / s.tasks.length) * 100)

export const bar = (pct: number, width: number): string => {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
