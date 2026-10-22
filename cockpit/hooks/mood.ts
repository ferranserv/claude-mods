// Which state Clawd shows, and what his speech bubble says. Pure: the plugin gathers the signals, this decides.
//
// Three levels, so the general state of the account never talks over the task:
//   1. needs you now     hand (a permission prompt is open), writing, idea (a plan waits for approval)
//   2. the task          only while Claude works: oops, boom (a check failed), lab (a check passed), ship (a commit, push or PR), plug (events of the task), dizzy (compacting), then creating,
//                        building, reading, browse (the tool that runs), then coffee (cycles with the work after
//                        COFFEE_AFTER_MS), typing, thinking. Session events (walk, hello) and the owner's own actions
//                        (love, wand) play whenever they happen, for FLEET_MS, and are not kept.
//   3. when it is over   bell, then coins (the saver kept money), then a notice (talk), then the status alerts, ROTATING
//                        every ROTATE_MS, worst first: asleep, mad, fire, gauge, sleepy, drunk, cold, hourglass,
//                        detective, plug (a connector still down). Nothing left: idle.
// While a turn runs no status alert is shown, not even a critical one (owner's choice).
import type { StateId } from './states'
import type { ActionId } from './lib'

export type Fleet = 'oops' | 'boom' | 'bell' | 'lab' | 'ship' | 'love' | 'idea' | 'wand' | 'coins' | 'plug'
/** idea is not here: it waits for you, so it ranks with the raised hand. */
export const FLEET_ORDER: readonly Fleet[] = ['oops', 'boom', 'bell', 'lab', 'ship', 'love', 'wand', 'coins', 'plug']
/** Status alerts, worst first: shown only when Claude is not working, one at a time, in turns. */
export const ALERT_ORDER = ['asleep', 'mad', 'fire', 'gauge', 'sleepy', 'drunk', 'cold', 'hourglass', 'detective', 'plug'] as const
export const isAlert = (id: StateId): boolean => (ALERT_ORDER as readonly string[]).includes(id)
export type ToolKind = 'building' | 'reading' | 'browse' | 'creating'

/** How long each fleeting event plays, in ms. */
export const FLEET_MS: Record<Fleet, number> = { oops: 5000, boom: 6500, bell: 5000, lab: 5000, ship: 6700, love: 5000, idea: 5000, wand: 5000, coins: 5000, plug: 6000 }
/**
 * `ship` and `boom` are long scenes that end in a calm pose (the rocket standing again, the soot): the event lasts the move
 * INTO the scene plus this much of the loop, so he always leaves from that calm pose and the move out has nothing to jump from.
 */
export const LOOP_EXIT_MS: Partial<Record<Fleet, number>> = { ship: 5200, boom: 5000 }
/** Whatever state is shown stays at least this long, unless something more important arrives. */
export const HOLD_MS = 5000
/** A tool's state lingers this long after it ends, so quick calls are still seen. */
export const TOOL_LINGER_MS = 1200
export const START_MS = 5000
/** Coffee starts after this much work, then comes for COFFEE_SHOW_MS every COFFEE_CYCLE_MS and goes back to the task. */
export const COFFEE_AFTER_MS = 420_000
export const COFFEE_CYCLE_MS = 40_000
export const COFFEE_SHOW_MS = 6_000
/** Each status alert is shown this long before the next one. */
export const ROTATE_MS = 6_000

export type MoodInput = {
  now: number
  waiting: boolean
  writing: boolean
  fleet: Partial<Record<Fleet, number>>
  compacting: boolean
  tool: { kind: ToolKind; until: number } | null
  walkUntil: number
  helloUntil: number
  ctx: 'calm' | 'warn' | 'alert'
  cache: 'unknown' | 'warm' | 'soon' | 'cold'
  fiveUsed: number
  /** What the week has allotted through today minus what is used, in points; negative is over. */
  weekRoom: number
  hasAdvice: boolean
  hasNote: boolean
  busy: boolean
  busyMs: number
  hasTool: boolean
  /** A connector failed to connect and is still down. */
  offline: boolean
}

/** The status alerts that are true now, worst first. They only exist while Claude is not working. */
export function activeAlerts(i: MoodInput): StateId[] {
  const on: Record<(typeof ALERT_ORDER)[number], boolean> = {
    asleep: i.fiveUsed >= 100,
    mad: i.weekRoom < 0,
    fire: i.ctx === 'alert',
    gauge: i.weekRoom >= 0 && i.weekRoom <= 2,
    sleepy: i.fiveUsed >= 80 && i.fiveUsed < 100,
    drunk: i.ctx === 'warn',
    cold: i.cache === 'cold',
    hourglass: i.cache === 'soon',
    detective: i.hasAdvice,
    plug: i.offline,
  }
  return ALERT_ORDER.filter(id => on[id])
}

const coffeePhase = (busyMs: number): number => (busyMs - COFFEE_AFTER_MS) % COFFEE_CYCLE_MS

export function pickState(i: MoodInput): StateId {
  if (i.waiting) return 'hand'
  if (i.writing) return 'writing'
  if ((i.fleet.idea ?? 0) > i.now) return 'idea'
  for (const f of FLEET_ORDER) if ((i.fleet[f] ?? 0) > i.now) return f
  if (i.compacting) return 'dizzy'
  if (i.tool && i.tool.until > i.now) return i.tool.kind
  if (i.walkUntil > i.now) return 'walk'
  if (i.helloUntil > i.now) return 'hello'
  if (i.busy) {
    if (i.busyMs >= COFFEE_AFTER_MS && coffeePhase(i.busyMs) < COFFEE_SHOW_MS) return 'coffee'
    return i.hasTool ? 'typing' : 'thinking'
  }
  if (i.hasNote) return 'talk'
  const alerts = activeAlerts(i)
  if (alerts.length > 0) return alerts[Math.floor(i.now / ROTATE_MS) % alerts.length]!
  return 'idle'
}

/** Milliseconds until the state may change with nothing else happening (coffee comes or goes, the next alert's turn), or null. */
export function nextShift(i: MoodInput): number | null {
  if (i.busy) {
    if (i.busyMs < COFFEE_AFTER_MS) return COFFEE_AFTER_MS - i.busyMs
    const p = coffeePhase(i.busyMs)
    return p < COFFEE_SHOW_MS ? COFFEE_SHOW_MS - p : COFFEE_CYCLE_MS - p
  }
  return activeAlerts(i).length > 1 ? ROTATE_MS - (i.now % ROTATE_MS) : null
}

export type Bubble = { text: string; /** the alert row this bubble stands for, so an open band does not say it twice */ alertId?: string; action?: ActionId }

export type BubbleInput = {
  ctxPercent: number
  ctxText: string
  cacheLabel: string
  fiveUsed: number
  fiveReset: string
  weekPace: string
  weekRoom: number
  saverOn: boolean
  detail: string
  savedUsd: string
  hasAdvice: boolean
}

/** What he says, or null when the band already says it (preflight rows) or there is nothing to say. */
export function bubbleFor(id: StateId, b: BubbleInput): Bubble | null {
  switch (id) {
    case 'hand': return { text: 'Waiting for your answer' }
    case 'writing': return { text: 'Writing it down…' }
    case 'oops': return { text: b.detail !== '' ? `${b.detail} failed` : 'A tool failed' }
    case 'bell': return { text: 'Done.' }
    case 'boom': return { text: 'Checks failed' }
    case 'lab': return { text: 'Checks passed' }
    case 'ship': return { text: b.detail !== '' ? b.detail : 'Shipped' }
    case 'love': return { text: 'Handoff ready in the prompt box. Review, then Enter.' }
    case 'idea': return { text: 'Plan approved' }
    case 'wand': return { text: 'Draft enhanced. ↩ restores yours.' }
    case 'coins': return { text: b.savedUsd !== '' ? `Haiku answered that · saved ${b.savedUsd} today` : 'Haiku answered that' }
    case 'plug': return { text: 'A connector is offline' }
    case 'dizzy': return { text: 'Compacting the conversation' }
    case 'creating': return { text: b.detail !== '' ? `Creating ${b.detail}` : 'Creating a file' }
    case 'building': return { text: b.detail !== '' ? `Editing ${b.detail}` : 'Editing' }
    case 'reading': return { text: b.detail !== '' ? `Reading ${b.detail}` : 'Reading' }
    case 'browse': return { text: 'Searching the web' }
    case 'walk': return null
    case 'hello': return { text: 'Hi! What are we building?' }
    case 'asleep': return { text: `5-hour limit reached. Back at ${b.fiveReset}`, alertId: 'five', action: 'copy' }
    case 'mad': return b.saverOn ? null : { text: `Over today's allowance (${b.weekPace})`, alertId: 'week', action: 'saverOn' }
    case 'fire': return { text: `Context ${Math.round(b.ctxPercent)}%. Hand off now.`, alertId: 'ctx', action: 'copy' }
    case 'detective': return null
    case 'cold': return { text: 'Cache is cold: the next message pays full price', alertId: 'cache', action: 'handoff' }
    case 'hourglass': return { text: `Cache goes cold in ${b.cacheLabel}`, alertId: 'cache', action: 'handoff' }
    case 'gauge': return b.saverOn ? null : { text: 'Almost out for today', alertId: 'week', action: 'saverOn' }
    case 'drunk': return { text: b.ctxText, alertId: 'ctx', action: 'copy' }
    case 'sleepy': return b.saverOn ? null : { text: `${Math.round(b.fiveUsed)}% of the 5-hour limit used`, alertId: 'five', action: 'saverOn' }
    case 'coffee': return { text: 'Still on it. Coffee break.' }
    case 'talk': return null
    case 'typing':
    case 'thinking':
    case 'idle':
      return null
  }
}

/** What Clawd says when you hover over him in a pose that has no bubble of its own. */
export function hoverHint(id: StateId): string | null {
  if (id === 'thinking') return 'Thinking…'
  if (id === 'typing') return 'Working on it'
  if (id === 'idle') return 'Ready when you are'
  return null
}

/** Every state, most important first: a shown state is only interrupted by one earlier in this list. */
export const ORDER: readonly StateId[] = [
  'hand', 'writing', 'idea', ...FLEET_ORDER, 'dizzy', 'creating', 'building', 'reading', 'browse', 'walk', 'hello',
  'talk', ...ALERT_ORDER.filter(id => id !== 'plug'), 'coffee', 'typing', 'thinking', 'idle',
]
export const rank = (id: StateId): number => ORDER.indexOf(id)

/** HH:MM in the person's time, for the alarm clock and the bubble; `--:--` when there is no reset time. */
export function clockOf(iso: string | undefined): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
