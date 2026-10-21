// Which state Clawd shows, and what his speech bubble says. Pure: the plugin gathers the signals, this decides.
//
// Several things are true at once, so there is an order. Fleeting events win over lasting conditions: they
// play for a few seconds and the lasting state comes back by itself. Highest first:
//   1. needs you now          hand (a permission prompt is open), writing (a brief or a draft is being written)
//   2. fleeting events        oops, bell, lab, love, idea, wand, coins, plug
//   3. while it happens       dizzy (compacting), then creating (a file is being written), building, reading, browse (the tool that is running)
//   4. session start          walk, hello
//   5. lasting warnings       asleep, mad, fire, talk (a notice waits for OK), detective, cold, hourglass, gauge, drunk, sleepy
//   6. background             coffee, typing, thinking, talk (a notice is up), idle
import type { StateId } from './states'
import type { ActionId } from './lib'

export type Fleet = 'oops' | 'bell' | 'lab' | 'love' | 'idea' | 'wand' | 'coins' | 'plug'
export const FLEET_ORDER: readonly Fleet[] = ['oops', 'bell', 'lab', 'love', 'idea', 'wand', 'coins', 'plug']
export type ToolKind = 'building' | 'reading' | 'browse' | 'creating'

/** How long each fleeting event plays, in ms. */
export const FLEET_MS: Record<Fleet, number> = { oops: 5000, bell: 5000, lab: 5000, love: 5000, idea: 5000, wand: 5000, coins: 5000, plug: 6000 }
/** Whatever state is shown stays at least this long, unless something more important arrives. */
export const HOLD_MS = 5000
/** A tool's state lingers this long after it ends, so quick calls are still seen. */
export const TOOL_LINGER_MS = 1200
export const START_MS = 5000
export const COFFEE_AFTER_MS = 120_000

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
}

export function pickState(i: MoodInput): StateId {
  if (i.waiting) return 'hand'
  if (i.writing) return 'writing'
  for (const f of FLEET_ORDER) if ((i.fleet[f] ?? 0) > i.now) return f
  if (i.compacting) return 'dizzy'
  if (i.tool && i.tool.until > i.now) return i.tool.kind
  if (i.walkUntil > i.now) return 'walk'
  if (i.helloUntil > i.now) return 'hello'
  if (i.fiveUsed >= 100) return 'asleep'
  if (i.weekRoom < 0) return 'mad'
  if (i.ctx === 'alert') return 'fire'
  if (i.hasNote) return 'talk'
  // Findings wait for Claude to stop (they are not offered while it works), and so does the detective: thinking is thinking.
  if (i.hasAdvice && !i.busy) return 'detective'
  if (!i.busy && i.cache === 'cold') return 'cold'
  if (!i.busy && i.cache === 'soon') return 'hourglass'
  if (i.weekRoom <= 2) return 'gauge'
  if (i.ctx === 'warn') return 'drunk'
  if (i.fiveUsed >= 80) return 'sleepy'
  if (i.busy) return i.busyMs > COFFEE_AFTER_MS ? 'coffee' : i.hasTool ? 'typing' : 'thinking'
  return 'idle'
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
    case 'lab': return { text: 'Tests passed' }
    case 'love': return { text: 'Handoff ready in the prompt box. Review, then Enter.' }
    case 'idea': return { text: 'Plan ready for your approval' }
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
    case 'coffee': return { text: 'Still on it. Coffee time.' }
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
  'hand', 'writing', ...FLEET_ORDER, 'dizzy', 'creating', 'building', 'reading', 'browse', 'walk', 'hello',
  'asleep', 'mad', 'fire', 'talk', 'detective', 'cold', 'hourglass', 'gauge', 'drunk', 'sleepy', 'coffee', 'typing', 'thinking', 'idle',
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
