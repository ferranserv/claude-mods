import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, Cache, EnhancerState, Fill, Limit, Notice, Saved, StripMode } from '../types'
import { bandKey, stack } from './bands'
import { SYSTEM, SYSTEM_LEAN, buildPrompt, cleanOutput, clip, matchesChord as matchesEnhancerChord, parseChord as parseEnhancerChord, pickSkills } from './enhancer-logic'
import type { SkillInfo } from './enhancer-logic'
import { BRIEF_PROMPT, briefPath, coldPrompt, transcriptTail } from './handoff'
import { matchesChord, parseChord } from './keys'
import {
  CACHE_INITIAL,
  DEFAULT_LIMITS,
  allottedThrough,
  alertsOf,
  altText,
  attentionOf,
  bandWidth,
  cacheView,
  clockText,
  C,
  bubbleSvg,
  cockpitSvg,
  learnWindow,
  line,
  model,
  money,
  priceOf,
  sideSvg,
  sideWidth,
  wandSvg,
  windowMinutes,
} from './lib'
import type { ActionId, Alert, Model, Thresholds } from './lib'
import { COFFEE_AFTER_MS, FLEET_MS, HOLD_MS, START_MS, TOOL_LINGER_MS, bubbleFor, clockOf, pickState, rank } from './mood'
import type { Bubble, Fleet, ToolKind } from './mood'
import {
  WRITE_TOOLS,
  advise,
  checkpointMessage,
  label,
  norm,
  parseNumstat,
  parseStatus,
  peerCommitMessage,
  peerKind,
  pickFiles,
  relativeTo,
  sameDir,
  short,
  slugOf,
  worktreePath,
} from './preflight-logic'
import type { Change, Facts, Peer, Phase, Stat } from './preflight-logic'
import { COLOR, CONTEXT_LIMIT, HAIKU_ID, dayKey, isStripShown, labelLocally, parseMode, realSaving, shortName } from './saver-logic'
import type { Level } from './saver-logic'
import { logPath, turnRow, withRow } from './turnlog'
import { STATES, STATE_IDS, enterMarkup, stateMarkup } from './states'
import type { StateId } from './states'

// ======================================================================================================
// One file on purpose: a hook may pass `$` only to functions declared in the same file, and an event can
// be hooked once per plugin, so every feature's `$` code lives here, in sections: meters, saver,
// preflight, enhancer, then the band that draws them. Pure code (numbers, rules, drawing) is in the
// other files of this folder.
// ======================================================================================================

const PANE = 'cockpit'

// ---- state: every value the band reads, in one contract (types/index.d.ts)
const fillRef = { plugin: 'cockpit', key: 'fill' } as const
const cacheRef = { plugin: 'cockpit', key: 'cache' } as const
const modelIdRef = { plugin: 'cockpit', key: 'modelId' } as const
const fill = atom(fillRef, null as Fill | null)
const limits = atom({ plugin: 'cockpit', key: 'limits' } as const, [] as Limit[])
const isSide = atom({ plugin: 'cockpit', key: 'isSide' } as const, false)
// Bumped when the side panel opens or closes, so the band above the prompt redraws.
const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, 0)
const cache = atom(cacheRef, CACHE_INITIAL as Cache)
const modelId = atom(modelIdRef, '')
const isBusy = atom({ plugin: 'cockpit', key: 'isBusy' } as const, false)
// The context warning levels in force: the options, unless /meters warn|red|tokens changed them.
const lim = atom({ plugin: 'cockpit', key: 'lim' } as const, DEFAULT_LIMITS as Thresholds)
const saverOn = atom({ plugin: 'cockpit', key: 'saverOn' } as const, true)
const saverLast = atom({ plugin: 'cockpit', key: 'saverLast' } as const, null as string | null)
const saverSaved = atom({ plugin: 'cockpit', key: 'saverSaved' } as const, { day: '', usd: 0 } as Saved)
const stripMode = atom({ plugin: 'cockpit', key: 'stripMode' } as const, 'active' as StripMode)
const lastRouted = atom({ plugin: 'cockpit', key: 'lastRouted' } as const, false)
const preflightOn = atom({ plugin: 'cockpit', key: 'preflightOn' } as const, true)
const advice = atom({ plugin: 'cockpit', key: 'advice' } as const, [] as Advice[])
const isDismissed = atom({ plugin: 'cockpit', key: 'isDismissed' } as const, false)
const pending = atom({ plugin: 'cockpit', key: 'pending' } as const, null as string | null)
const notice = atom({ plugin: 'cockpit', key: 'notice' } as const, null as Notice | null)
const stateAtom = atom({ plugin: 'cockpit', key: 'enhancer' } as const, { hasDraft: false, isBusy: false, original: '' } as EnhancerState)
const pinnedOpen = atom({ plugin: 'cockpit', key: 'pinnedOpen' } as const, false)
const snooze = atom({ plugin: 'cockpit', key: 'snooze' } as const, 0)

// ---- options, read once when the plugin loads
let defaults: Thresholds = DEFAULT_LIMITS
let fallbackMin = 60
let notifyMin = 5
let stepMin = 5
let handoffChord: ReturnType<typeof parseChord>
let freshChord: ReturnType<typeof parseChord>
let handoffLabel = 'meta+h'
let freshLabel = 'meta+n'
let enhanceLabel = 'meta+e'
let hasSound = true
// How Clawd is drawn: normal (2x), small (1x) or off. The option sets the start; /cockpit mascot changes and remembers it.
let mascotMode: 'normal' | 'small' | 'off' = 'normal'
let enhancerCfg: Cfg = { model: 'haiku', maxSkills: 12, lean: false }
let enhancerChord: ReturnType<typeof parseEnhancerChord>

const safe = async (fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn()
  } catch {
    // One feature failing must not stop the others on the same event.
  }
}

// ---- what Clawd reacts to: signals the hooks leave here, read when the band is drawn (order: hooks/mood.ts)
const mood = {
  waiting: false, // a permission prompt is open
  compacting: false,
  fleet: {} as Partial<Record<Fleet, number>>, // fleeting events, by the time they end
  tool: null as { kind: ToolKind; until: number } | null,
  toolNote: '',
  failNote: '',
  walkUntil: 0,
  helloUntil: 0,
  isFirstPrompt: true,
  busySince: 0,
  hasTool: false,
  demo: null as { id: StateId; until: number; single: boolean } | null, // single: the only state of the demo; one with a button then stays until you answer it
  demoRun: 0,
  writing: false, // a handoff brief or an enhanced draft is being written
  sticky: null as { bubble: Bubble; state: StateId } | null, // a bubble that asks for a decision stays until you click its button or send something else
  linger: null as { bubble: Bubble; until: number; state: StateId } | null, // any other bubble stays a while after its state ends
  dismissed: [] as string[], // warnings whose bubble you answered; quiet until the warning ends and comes back
  shownAlert: null as string | null, // the warning the bubble on screen stands for
  resetAt: 0, // the next limit reset a redraw is already booked for
  lastSaid: null as string | null, // what the bubble said last, so it can fade out in the same drawing
  draftTurn: false, // the turn is a /handoff: Claude writes the brief as text, with no tool to show it
  askAt: 0, // when a permission ask was seen; it only counts if nothing has moved on a moment later
  msg: null as { text: string; until: number } | null, // a message to you (the one channel: the bubble), over everything but the raised hand
  history: [] as string[], // the last things the bubble said, for /cockpit log
  lastLogged: '', // the text last added to the history
  askId: '', // the call that ask is for: only that call starting running again, or ending, settles it
  drawn: null as { id: StateId; since: number } | null, // what is on screen, and since when
  move: null as { from: StateId; to: StateId } | null, // the state he left, so the drawing can play the move into the one he is in
}
// Where the speech bubble is drawn: float (a pixel bubble in a row above the band, tail to Clawd) or inline (a text row under the band).
let bubbleMode: 'float' | 'inline' = 'float'
/** A permission ask must stay open this long before Clawd raises a hand: a rule or the mode often settles it first. Set by the askSeconds option. */
let askMs = 5000
/** How long a bubble stays after its state has ended. */
const BUBBLE_LINGER_MS = 12_000

/** Clawd's drawing: the move from the state he left and the state's own loop, in one drawing (see enterMarkup). */
function mascotFor(state: StateId, clock: string, move: { from: StateId; to: StateId } | null, scale: 1 | 2) {
  if (move && move.to === state) {
    try {
      return enterMarkup(move.from, move.to, clock, scale)
    } catch {
      // A move that cannot be drawn falls back to the state itself.
    }
  }
  return stateMarkup(state, clock, scale)
}

/** Redraw now, and again when a timed state ends. */
function poke($: EngineInterface, ms = 0): void {
  $.ui.invalidate('ui.render')
  if (ms > 0) $.clock.after(ms + 80, () => $.ui.invalidate('ui.render'))
}

/** How long a message stays in the bubble. */
const MSG_MS = 8000

function remember(now: number, text: string): void {
  mood.lastLogged = text
  mood.history.push(`${clockOf(new Date(now).toISOString())} ${text}`)
  if (mood.history.length > 10) mood.history.shift()
}

/**
 * Says something to you: in the bubble, the one channel for messages. `detail` is the longer form kept for /cockpit log.
 * A side pane hides the band, so there it goes to a toast as well.
 */
async function tell($: EngineInterface, text: string, detail = text): Promise<void> {
  const now = await $.clock.now()
  mood.msg = { text, until: now + MSG_MS }
  remember(now, detail)
  poke($, MSG_MS)
  if (await read($, isSide)) $.ui.toast(text)
}

async function flash($: EngineInterface, id: Fleet): Promise<void> {
  mood.fleet[id] = (await $.clock.now()) + FLEET_MS[id]
  poke($, FLEET_MS[id])
}

type ToolInput = { tool?: string; tool_use_id?: string; file_path?: string; notebook_path?: string; pattern?: string; command?: string }
const TEST_COMMAND = /\b(pytest|vitest|jest|mocha|rspec|phpunit|ctest|go test|cargo test|npm (run )?test|pnpm (run )?test|yarn test|bun test|deno test|dotnet test|make (test|check)|mvn( \S+)* test|gradlew? (\S+ )*test|node --test|unittest|tox|nox|plugin test)\b/i
const baseName = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''

function toolKind(tool: string): ToolKind | null {
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return 'building'
  if (['Read', 'Grep', 'Glob', 'NotebookRead', 'LS'].includes(tool)) return 'reading'
  if (['WebSearch', 'WebFetch'].includes(tool)) return 'browse'
  return null
}

/** A tool call starts: Clawd shows what kind of work it is for as long as it runs. */
function toolStarts($: EngineInterface, input: ToolInput): void {
  const tool = String(input.tool ?? '')
  mood.hasTool = true
  const kind = toolKind(tool)
  if (kind) {
    mood.tool = { kind, until: Number.MAX_SAFE_INTEGER }
    mood.toolNote = baseName(String(input.file_path ?? input.notebook_path ?? input.pattern ?? ''))
  }
  poke($)
}

/** It ends: the tool state lingers a moment; a failed call, a passing test run and an approved plan flash. */
async function toolEnds($: EngineInterface, input: ToolInput, r: { isError?: boolean } | undefined): Promise<void> {
  const tool = String(input.tool ?? '')
  const now = await $.clock.now()
  // tool.call wraps the permission prompt, so a call is "starting" before it is asked and running only after: the end of
  // the asked call is the first moment it is certainly settled. Another call ending (parallel calls) settles nothing.
  if (mood.askId !== '' && (input.tool_use_id === undefined || input.tool_use_id === mood.askId)) {
    mood.waiting = false
    mood.askAt = 0
    mood.askId = ''
  }
  if (mood.tool) {
    mood.tool = { kind: mood.tool.kind, until: now + TOOL_LINGER_MS }
    poke($, TOOL_LINGER_MS)
  }
  if (r?.isError) {
    mood.failNote = tool
    await flash($, 'oops')
  } else if (tool === 'ExitPlanMode') await flash($, 'idea')
  else if ((tool === 'Bash' || tool === 'PowerShell') && TEST_COMMAND.test(String(input.command ?? ''))) await flash($, 'lab')
}

/** A demo that waits for its button has no end time. */
const HELD = Number.MAX_SAFE_INTEGER

/** `/cockpit demo`: shows every state for four seconds each, so you can check them on your own screen. */
async function demoLoop($: EngineInterface, ids: StateId[]): Promise<void> {
  const run = ++mood.demoRun
  try {
    for (const id of ids) {
      if (run !== mood.demoRun) return
      mood.demo = { id, until: (await $.clock.now()) + 4000, single: ids.length === 1 }
      poke($)
      await $.clock.sleep(4000)
    }
    // A demo held for a button (see snapshot) ends when that is answered, not on a timer.
    if (run === mood.demoRun && mood.demo?.until !== HELD) {
      mood.demo = null
      poke($)
    }
  } catch {
    // The session ended while the demo was playing.
  }
}

// ======================= meters =======================

// The countdown text last drawn: the band is redrawn only when it changes.
let lastLabel = ''
let isHandoffRunning = false
// Commands the app refused at session start, for /meters status.
const failed: string[] = []

function patchCache($: EngineInterface, fn: (c: Cache) => Cache) {
  return update($, cache, fn)
}

/** Every 15 seconds: redraws the band when the countdown text changed, sends the going-cold notice. */
async function pulse($: EngineInterface, notifyMin: number, stepMin: number) {
  const c = (await $.state.get(cacheRef)).value ?? CACHE_INITIAL
  if (c.lastAt <= 0) return
  const now = await $.clock.now()
  const tokens = (await $.state.get(fillRef)).value?.tokens ?? 0
  const price = priceOf((await $.state.get(modelIdRef)).value ?? '')
  const v = cacheView(c, now, tokens, price, notifyMin, stepMin)
  if (v.label !== lastLabel) {
    lastLabel = v.label
    $.ui.invalidate('ui.render')
  }

  if (v.state === 'soon' && c.notifiedAt !== c.lastAt) {
    await patchCache($, s => ({ ...s, notifiedAt: s.lastAt }))
    const mins = Math.max(1, Math.round(v.leftMs / 60_000))
    const cost = v.warmUsd !== null && v.coldUsd !== null ? ` Next message: ${money(v.warmUsd)} warm, ${money(v.coldUsd)} after.` : ''
    const text = `Prompt cache goes cold in ~${mins} min.${cost}`
    try {
      await $.ui.notify(text, { title: 'Cockpit' })
    } catch {
      // No terminal to notify (desktop host): the hourglass and its bubble are the warning.
    }
  }
}

/** Writes a handoff brief, clears the session, pastes the brief into the fresh one. */
type HandoffMode = 'full' | 'paste' | 'brief'

/** The person's home folder (Windows has USERPROFILE, not HOME); '' if none is known. */
async function homeOf($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || `${(await $.env.get('HOMEDRIVE')) ?? ''}${(await $.env.get('HOMEPATH')) ?? ''}`
}

/** Writes the brief under the home folder. Returns the path, or '' if it could not. */
async function saveCopy($: EngineInterface, brief: string, now: number): Promise<string> {
  try {
    const home = await homeOf($)
    if (!home) return ''
    const path = briefPath(home, now)
    await $.fs.write(path, brief + '\n')
    return path
  } catch {
    return ''
  }
}

// The turn log of this session: rows already written (read once, so a reload or a resumed session adds to its file).
let turnLines: string | null = null
let hasLog = true

async function logTurn($: EngineInterface, e: { reason: string; durationMs: number; usage?: Parameters<typeof turnRow>[0]['usage'] }): Promise<void> {
  const home = await homeOf($)
  if (!home) return
  const session = await $.session.id()
  const path = logPath(home, session)
  if (turnLines === null) {
    try {
      const raw = (await $.fs.exists(path)) ? ((await $.fs.read(path)) as unknown) : ''
      turnLines = typeof raw === 'string' ? raw : String((raw as { text?: string }).text ?? '')
    } catch {
      turnLines = ''
    }
  }
  const fillNow = await read($, fill)
  turnLines = withRow(turnLines, turnRow({ now: await $.clock.now(), session, reason: e.reason, ms: e.durationMs, usage: e.usage, routed: await read($, lastRouted), ctxPercent: fillNow ? fillNow.percent : null }))
  await $.fs.write(path, turnLines)
}

/**
 * full: write a brief, clear the session, paste the brief into the fresh one.
 * paste: put the last brief back in the box, no clear. brief: write one, copy it and put it in the box, keep the session.
 */
async function handoff($: EngineInterface, mode: HandoffMode) {
  const pasteOnly = mode === 'paste'
  if (isHandoffRunning) return
  isHandoffRunning = true
  try {
    if (await read($, isBusy)) {
      await tell($, 'Claude is working. Try again after the turn.')
      return
    }
    if (!pasteOnly) {
      mood.writing = true
      poke($)
    }

    let savedAt = ''
    let brief = pasteOnly ? (((await $.store.get('lastBrief')) as string | undefined) ?? '') : ''
    if (!pasteOnly) {
      const c = await read($, cache)
      const now = await $.clock.now()
      // Warm cache: the fork reads the whole transcript from the cache, nearly free. Cold: re-caching it
      // would cost full price, so a small model reads the tail of the transcript instead.
      if (cacheView(c, now, 0, null).state !== 'cold' && c.lastAt > 0) {
        const forked = await $.model.fork({ prompt: BRIEF_PROMPT })
        if (forked.isAnswered) brief = forked.text.trim()
      }
      if (brief === '') {
        const rows = await $.session.messages()
        const tail = Array.isArray(rows) ? transcriptTail(rows, 60_000) : ''
        if (tail === '') {
          await tell($, 'Nothing to hand off yet.')
          return
        }
        const r = await $.model.complete({ model: 'haiku', prompt: coldPrompt(tail), maxTokens: 1200, effort: 'low', timeoutMs: 60_000 })
        if (r.isAnswered) brief = r.text.trim()
      }
      if (brief === '') {
        await tell($, 'Could not write the brief. Session untouched.')
        return
      }
      await $.store.set('lastBrief', brief)
      // The copy on disk is a safety net; the paste below is the point. Say if it could not be written.
      savedAt = await saveCopy($, brief, now)
      if (savedAt !== '') await $.store.set('lastBriefPath', savedAt)
    }
    if (brief === '') {
      await tell($, 'No handoff brief saved yet.')
      return
    }

    const where = savedAt !== '' ? ` A copy is saved at ${savedAt}.` : pasteOnly ? '' : ' (A copy could not be saved to your home folder.)'

    if (mode === 'brief') {
      // Keep the session: the brief goes to the clipboard and the prompt box (after any draft already there).
      const draft = (await $.prompt.read()).text
      await $.prompt.fill({ text: draft.trim() === '' ? brief : `\n\n${brief}`, mode: draft.trim() === '' ? 'replace' : 'append' })
      let isCopied = false
      try {
        isCopied = (await $.ui.copy({ text: brief })).isCopied
      } catch {
        isCopied = false
      }
      await safe(() => flash($, 'love'))
      remember(await $.clock.now(), `Handoff brief ${isCopied ? 'copied and ' : ''}placed in the prompt box. Your session is unchanged.${where}`)
      return
    }

    // Re-pasting goes into the session you are already in: clearing again would throw that away.
    if (!pasteOnly) await $.command.run({ command: 'clear' })
    // The clear can land after the call returns: paste, wait, and check the box still holds the brief.
    let isPasted = false
    for (let attempt = 0; attempt < 3 && !isPasted; attempt++) {
      await $.clock.sleep(500)
      await $.prompt.fill({ text: brief, mode: 'replace' })
      isPasted = (await $.prompt.read()).text === brief
    }
    if (isPasted) await safe(() => flash($, 'love'))
    if (isPasted) remember(await $.clock.now(), `Handoff brief is in the prompt box: review, then Enter.${where}`)
    else await tell($, 'Brief not pasted. /newsession paste retries.', `The brief could not be pasted. /newsession paste retries.${where}`)
  } catch {
    await tell($, 'Handoff failed. Check the session first.', 'Handoff failed. Nothing was cleared unless the session looks new.')
  } finally {
    isHandoffRunning = false
    mood.writing = false
    poke($)
  }
}

async function fresh($: EngineInterface) {
  if (await read($, isBusy)) {
    await tell($, 'Claude is working. Wait for the turn to end.')
    return
  }
  await $.command.run({ command: 'clear' })
}

/** Compacts this session now, the lighter answer to a full context (the same as typing /compact). */
async function compactNow($: EngineInterface) {
  if (await read($, isBusy)) {
    await tell($, 'Claude is working. Compact waits for the turn.')
    return
  }
  try {
    const r = await $.session.compact()
    if ('skip' in r && r.skip) await tell($, 'Not compacted.', `Not compacted: ${r.skip}`)
  } catch {
    await tell($, 'Could not compact. Type /compact.')
  }
}

/** `/cache`, `/cache 30`, `/cache auto`: sets the window if asked, then says what it is and how long is left. */
async function cacheReport($: EngineInterface, args: string, notifyMin: number, stepMin: number): Promise<string> {
  const arg = args.trim().toLowerCase()
  if (arg === 'auto') {
    await $.store.delete('cacheOverride')
    await patchCache($, c => ({ ...c, override: null }))
  } else if (arg !== '') {
    const minutes = Number(arg.replace(/m(in)?$/, ''))
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return 'Use /cache <minutes> (1 to 1440), or /cache auto.'
    await $.store.set('cacheOverride', Math.round(minutes))
    await patchCache($, c => ({ ...c, override: Math.round(minutes) }))
  }
  const c = await read($, cache)
  const now = await $.clock.now()
  const tokens = (await read($, fill))?.tokens ?? 0
  const v = cacheView(c, now, tokens, priceOf(await read($, modelId)), notifyMin, stepMin)
  const source = c.override !== null ? 'set by you' : c.detected !== null ? 'learned from the API' : `default, not learned yet (${c.misses} miss${c.misses === 1 ? '' : 'es'} seen)`
  const left = v.state === 'unknown' ? 'no reply yet' : v.state === 'cold' ? 'cold' : `${clockText(v.leftMs)} left`
  const cost = v.warmUsd !== null && v.coldUsd !== null ? ` Next message input: ${money(v.warmUsd)} warm, ${money(v.coldUsd)} cold.` : ''
  return `Prompt cache window ${windowMinutes(c)} min (${source}); ${left}.${cost}`
}

/** `paste` and `brief` anywhere in the arguments pick those modes; anything else is the full handoff. */
const handoffMode = (args: string): HandoffMode => (/\bpaste\b/i.test(args) ? 'paste' : /\b(brief|copy)\b/i.test(args) ? 'brief' : 'full')

const handoffSays = (m: HandoffMode): string =>
  m === 'paste' ? 'Putting the last handoff brief into the prompt box…' : m === 'brief' ? 'Writing a handoff brief into the prompt box; your session stays…' : 'Writing a handoff brief, then starting a fresh session…'

const thresholds = (o: Record<string, unknown>): Thresholds => {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
  const warn = n(o.warnPercent, DEFAULT_LIMITS.warnPercent)
  return { warnPercent: warn, redPercent: Math.max(warn, n(o.redPercent, DEFAULT_LIMITS.redPercent)), warnTokens: n(o.warnTokens, DEFAULT_LIMITS.warnTokens) }
}

/** `/meters warn 5`, `/meters red 70`, `/meters tokens 50000`, `/meters limits`, `/meters limits reset`. */
async function limitsReport($: EngineInterface, arg: string, defaults: Thresholds): Promise<string> {
  const [what = '', value = ''] = arg.split(/\s+/)
  const saved = (((await $.store.get('limitOverrides')) as Partial<Thresholds> | undefined) ?? {}) as Partial<Thresholds>
  let next: Partial<Thresholds> = saved
  if (what === 'limits' && value === 'reset') next = {}
  else if (what === 'warn' || what === 'red' || what === 'tokens') {
    const n = Number(value.replace(/k$/i, '')) * (/k$/i.test(value) ? 1000 : 1)
    const isPercent = what !== 'tokens'
    if (!Number.isFinite(n) || (isPercent && (n < 1 || n > 100)) || (!isPercent && n < 1000)) {
      return isPercent ? `Use /meters ${what} <1 to 100>.` : 'Use /meters tokens <number, at least 1000>, e.g. /meters tokens 150k.'
    }
    next = { ...saved, [what === 'warn' ? 'warnPercent' : what === 'red' ? 'redPercent' : 'warnTokens']: n }
  }
  if (next !== saved) await $.store.set('limitOverrides', next)
  const now: Thresholds = { ...defaults, ...next }
  if (now.redPercent < now.warnPercent) now.redPercent = now.warnPercent
  await update($, lim, () => now)
  const source = Object.keys(next).length > 0 ? 'changed with /meters' : 'from the options'
  return `Context warnings (${source}): orange from ${now.warnPercent}% or ${Math.round(now.warnTokens / 1000)}k tokens, red past ${now.redPercent}%. /meters limits reset goes back to the options.`
}

/** Chime at the end of a main-loop turn. $.audio.play only has a player on macOS; Windows gets the clip through PowerShell. */
async function chime($: EngineInterface): Promise<void> {
  void $.audio.play({ asset: 'sounds/done.wav' }).catch(() => undefined)
  if ((await $.env.get('OS')) === 'Windows_NT') {
    const wav = `${$.plugin.root}/sounds/done.wav`.replace(/'/g, "''")
    void $.process
      .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${wav}').PlaySync()`], { timeoutMs: 5000 })
      .catch(() => undefined)
  }
}


// ======================= saver =======================

// What the current turn was labelled; set when the prompt arrives, read at each step.
let turnLevel: Level = 'hard'
// The last routing decision in words, for /saver why.
let why = 'No prompt seen yet this session.'

async function setSaver($: EngineInterface, on: boolean): Promise<void> {
  await update($, saverOn, () => on)
  await $.store.set('saverOn', on)
}


// ======================= preflight =======================

type Run = { ok: boolean; out: string; err: string }

// Every git call goes through here: best effort, never throws (the desktop app may not allow commands).
async function git($: EngineInterface, cwd: string, args: string[]): Promise<Run> {
  try {
    const r = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 30_000 })
    return { ok: r.exitCode === 0, out: r.stdout, err: r.stderr }
  } catch {
    return { ok: false, out: '', err: 'cannot run git here' }
  }
}

async function parsePeer($: EngineInterface, path: string): Promise<Peer | null> {
  try {
    const raw = (await $.fs.read(path)) as unknown
    const text = typeof raw === 'string' ? raw : String((raw as { text?: string }).text ?? '')
    const p = JSON.parse(text) as Peer
    return typeof p.id === 'string' && typeof p.cwd === 'string' && typeof p.at === 'number' ? p : null
  } catch {
    return null
  }
}

type Repo = { cwd: string; root: string; common: string; branch: string }

// The repository's root and common git dir do not change while a session stays in one folder: only the branch does.
// The four lookups happen once; a refresh then spends one call on this instead of four.
let repoMemo: { cwd: string; root: string; common: string } | null = null

async function repoOf($: EngineInterface): Promise<Repo | null> {
  const cwd = await $.session.cwd()
  if (repoMemo && repoMemo.cwd === norm(cwd)) {
    const b = await git($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (b.ok) return { ...repoMemo, branch: b.out.trim() }
    repoMemo = null
  }
  const root = await git($, cwd, ['rev-parse', '--show-toplevel'])
  if (!root.ok) return null
  let common = await git($, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!common.ok) common = await git($, cwd, ['rev-parse', '--git-common-dir'])
  const branch = await git($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!common.ok || !branch.ok) return null
  let dir = norm(common.out.trim())
  if (!/^([a-z]:)?\//i.test(dir)) dir = `${norm(root.out.trim())}/${dir}`
  repoMemo = { cwd: norm(cwd), root: norm(root.out.trim()), common: dir }
  return { ...repoMemo, branch: branch.out.trim() }
}

const registryDir = (repo: Repo) => `${repo.common}/preflight-guard`

async function peersOf($: EngineInterface, repo: Repo, selfId: string): Promise<Peer[]> {
  try {
    const entries = await $.fs.list(registryDir(repo))
    const all = await Promise.all(entries.filter(f => f.name.endsWith('.json')).map(f => parsePeer($, `${registryDir(repo)}/${f.name}`)))
    return all.filter((p): p is Peer => p !== null && p.id !== selfId)
  } catch {
    return []
  }
}

async function gather($: EngineInterface, selfId: string, mine: Peer | null): Promise<Facts | null> {
  const repo = await repoOf($)
  if (!repo) return null
  const now = await $.clock.now()
  const head = await git($, repo.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const status = await git($, repo.cwd, ['status', '--porcelain=v1', '-z'])
  const gitDir = await git($, repo.cwd, ['rev-parse', '--absolute-git-dir'])
  let isBusy = repo.branch === 'HEAD'
  if (gitDir.ok) {
    for (const m of ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD']) {
      if (await $.fs.exists(`${norm(gitDir.out.trim())}/${m}`)) isBusy = true
    }
  }
  const peers = await peersOf($, repo, selfId)
  const numstat = async (dir: string) => {
    const d = await git($, dir, ['diff', 'HEAD', '--numstat'])
    return d.ok ? parseNumstat(d.out) : {}
  }
  const stats: Record<string, Record<string, Stat>> = { '': await numstat(repo.cwd) }
  const peerChanges: Record<string, Change[]> = {}
  for (const p of peers) {
    if (peerKind(p, now) === 'ignore' || sameDir(p.cwd, repo.cwd)) continue
    const s = await git($, p.cwd, ['status', '--porcelain=v1', '-z'])
    peerChanges[p.id] = s.ok ? parseStatus(s.out) : []
    if (peerChanges[p.id]?.length) stats[p.id] = await numstat(p.cwd)
  }
  return {
    now,
    cwd: repo.cwd,
    branch: repo.branch,
    originHead: head.ok ? head.out.trim().replace(/^origin\//, '') : '',
    isBusy,
    changes: status.ok ? parseStatus(status.out) : [],
    mine,
    peers,
    peerChanges,
    stats,
    isFirstTurn: true,
  }
}

async function say($: EngineInterface, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
  await update($, pending, () => null)
}

// ---- actions (each is one click; none pushes) ----

async function newWorktree($: EngineInterface, selfId: string): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder, so no worktree.', true)
  const slug = slugOf(selfId, await $.clock.now())
  const path = worktreePath(repo.root, slug)
  const made = await git($, repo.root, ['worktree', 'add', '-b', `claude/${slug}`, path, 'HEAD'])
  if (!made.ok) return say($, `Could not create the worktree: ${made.err.trim().split('\n')[0] ?? 'git refused'}`, true)
  // Keep the worktrees folder out of `git status` in the main folder.
  const exclude = `${repo.common}/info/exclude`
  try {
    const raw = (await $.fs.exists(exclude)) ? ((await $.fs.read(exclude)) as unknown) : ''
    const text = typeof raw === 'string' ? raw : String((raw as { text?: string }).text ?? '')
    if (!text.includes('.claude/worktrees/')) await $.fs.write(exclude, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}.claude/worktrees/\n`)
  } catch {
    // Cosmetic: the folder then shows as untracked in the main checkout.
  }
  await $.store.set('lastWorktree', path)
  await say($, `Worktree ready: claude/${slug}`)
}

async function switchInto($: EngineInterface): Promise<void> {
  const path = String((await $.store.get('lastWorktree')) ?? '')
  if (path === '') return say($, 'No worktree made yet.', true)
  // The tool is called directly: no model turn (which would re-read the whole context). The permission dialog still shows.
  try {
    await $.tool.call({ tool: 'EnterWorktree', path } as never)
    return say($, 'Switched into the worktree.')
  } catch {
    // The tool is not there (or refused to be called from here): fall back to asking Claude, one short turn.
  }
  await say($, 'Asking Claude to switch into the worktree (one short turn).')
  void $.prompt.submit({ text: `Call EnterWorktree with path "${path}" to switch this session into the existing worktree. Do nothing else.` })
}

async function checkpoint($: EngineInterface, onDefault: boolean): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder.', true)
  const status = await git($, repo.cwd, ['status', '--porcelain=v1', '-z'])
  const pk = pickFiles(parseStatus(status.out), [], true)
  if (pk.take.length === 0) return say($, 'Nothing to checkpoint (secrets are never taken).')
  let branch = repo.branch
  // On main: a new branch carries the uncommitted files with it and loses nothing.
  if (onDefault) {
    branch = `checkpoint/${slugOf(repo.cwd, await $.clock.now())}`
    const sw = await git($, repo.cwd, ['switch', '-c', branch])
    if (!sw.ok) return say($, `Could not open a branch: ${sw.err.trim().split('\n')[0] ?? 'git refused'}`, true)
  }
  const add = await git($, repo.cwd, ['add', '-A', '--', ...pk.take])
  if (!add.ok) return say($, `git add failed: ${add.err.trim().split('\n')[0] ?? ''}`, true)
  const c = await git($, repo.cwd, ['commit', '-m', checkpointMessage(pk.take.length, branch), '--', ...pk.take])
  if (!c.ok) return say($, `Commit failed: ${(c.err || c.out).trim().split('\n')[0] ?? ''}`, true)
  const skipped = pk.secrets.length > 0 ? ` ${pk.secrets.length} secret left alone.` : ''
  await say($, `Committed ${pk.take.length} files on ${branch}, not pushed.${skipped} Undo: git reset --soft HEAD~1`)
}

async function commitPeer($: EngineInterface, peerId: string): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder.', true)
  const peer = (await peersOf($, repo, '')).find(p => p.id === peerId)
  if (!peer) return say($, 'That session is gone.', true)
  // Re-check at click time: it may have started a new turn since the band was drawn.
  const now = await $.clock.now()
  if (peerKind(peer, now) === 'working') return say($, `Session ${short(peerId)} started working again. Wait for it to finish.`, true)
  const live = (await peersOf($, repo, '')).filter(p => peerKind(p, now) !== 'ignore' && sameDir(p.cwd, peer.cwd))
  const status = await git($, peer.cwd, ['status', '--porcelain=v1', '-z'])
  const pk = pickFiles(parseStatus(status.out), peer.files, live.length <= 1)
  if (pk.take.length === 0) return say($, 'Nothing of that session left to commit.')
  const add = await git($, peer.cwd, ['add', '-A', '--', ...pk.take])
  if (!add.ok) return say($, `git add failed: ${add.err.trim().split('\n')[0] ?? ''}`, true)
  const c = await git($, peer.cwd, ['commit', '-m', peerCommitMessage(pk.take.length, peerId, peer.branch), '--', ...pk.take])
  if (!c.ok) return say($, `Commit failed: ${(c.err || c.out).trim().split('\n')[0] ?? ''}`, true)
  const rest = pk.leave.length + pk.secrets.length
  await say($, `Committed ${pk.take.length} files on ${peer.branch}, not pushed.${rest > 0 ? ` ${rest} left alone.` : ''} Undo: git -C "${peer.cwd}" reset --soft HEAD~1`)
}

const S = { selfId: '', mine: null as Peer | null, lastWrite: 0, lastSig: '' }

// The heartbeat other sessions read. Overwritten, never deleted (no delete call): an ended session says so.
async function beat($: EngineInterface, phase: Phase, files: string[] = []): Promise<void> {
  try {
    const repo = await repoOf($)
    if (!repo) return
    const now = await $.clock.now()
    const known = new Set(S.mine?.files ?? [])
    for (const f of files) known.add(f)
    S.mine = { id: S.selfId, cwd: repo.cwd, branch: repo.branch, phase, at: now, files: [...known].slice(-300) }
    S.lastWrite = now
    await $.fs.write(`${registryDir(repo)}/${S.selfId}.json`, JSON.stringify(S.mine))
  } catch {
    // Without a heartbeat the other sessions simply do not see this one.
  }
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    if (!(await read($, preflightOn))) return update($, advice, () => []).then(() => undefined)
    const facts = await gather($, S.selfId, S.mine)
    const list = facts ? advise(facts) : []
    const sig = JSON.stringify(list.map(a => a.kind + ('peerId' in a ? a.peerId : '')))
    if (sig !== S.lastSig) {
      S.lastSig = sig
      await update($, isDismissed, () => false)
    }
    await update($, advice, () => list)
  } catch {
    // No git or no files here: the warnings stay as they were.
  }
}




// ======================= prompt enhancer =======================

type Cfg = { model: string; maxSkills: number; lean: boolean }

// Guards against a second Enhance while one runs; the visible flags live in $.state.
let isRunning = false
let lastHasDraft = false

function patch($: EngineInterface, p: Partial<EnhancerState>) {
  return update($, stateAtom, s => ({ ...s, ...p }))
}

async function setDraft($: EngineInterface, text: string) {
  const has = text.trim() !== '' && !text.trimStart().startsWith('/')
  if (has === lastHasDraft) return
  lastHasDraft = has
  await patch($, { hasDraft: has })
}

async function tryRead($: EngineInterface, path: string, width: number): Promise<string> {
  try {
    return clip((await $.fs.read(path)).trim(), width)
  } catch {
    return ''
  }
}

async function run($: EngineInterface, argv: string[]): Promise<string> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 4000 })
    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

async function collectSkills($: EngineInterface, draft: string, max: number): Promise<SkillInfo[]> {
  try {
    const cmds = await $.command.list()
    const own = new Set(['enhance'])
    const skills = cmds
      .filter(c => (c.source === 'user' || c.source === 'plugin') && !own.has(c.name))
      .map(c => ({ name: c.name, description: c.description }))
    return pickSkills(draft, skills, max)
  } catch {
    return []
  }
}

async function collectProject($: EngineInterface): Promise<string> {
  const [rules, readme, progress, request, pkg, toml, listing, git, log] = await Promise.all([
    tryRead($, 'CLAUDE.md', 1800),
    tryRead($, 'README.md', 700),
    tryRead($, 'PROGRESS.md', 600),
    tryRead($, 'REQUEST.md', 500),
    tryRead($, 'package.json', 1200),
    tryRead($, 'pyproject.toml', 600),
    $.fs.list('.').then(
      es => es.filter(x => !x.name.startsWith('.')).map(x => (x.kind === 'dir' ? `${x.name}/` : x.name)).slice(0, 40).join(' '),
      () => '',
    ),
    run($, ['git', 'status', '--short', '--branch']),
    run($, ['git', 'log', '-3', '--oneline']),
  ])
  const parts: [string, string][] = [
    ['CLAUDE.md', rules],
    ['README (head)', rules ? '' : readme],
    ['REQUEST.md', request],
    ['PROGRESS.md', progress],
    ['package.json', pkg],
    ['pyproject.toml', toml],
    ['top-level files', listing],
    ['git status', clip(git, 500)],
    ['recent commits', log],
  ]
  return parts.filter(([, v]) => v !== '').map(([k, v]) => `## ${k}\n${v}`).join('\n\n')
}

/** Rewrites the draft in the prompt box. Returns a one-line status for a command's output. */
async function enhance($: EngineInterface, cfg: Cfg, given?: string): Promise<string> {
  if (isRunning) return 'Already enhancing.'
  isRunning = true
  try {
    const draft = (given ?? (await $.prompt.read()).text).trim()
    if (draft === '') {
      await tell($, 'Type a draft first, then Enhance.')
      return 'Nothing to enhance.'
    }
    await patch($, { isBusy: true })
    mood.writing = true
    poke($)

    const [skills, project] = await Promise.all([collectSkills($, draft, cfg.maxSkills), collectProject($)])
    const r = await $.model.complete({
      model: cfg.model,
      system: cfg.lean ? SYSTEM_LEAN : SYSTEM,
      prompt: buildPrompt(draft, skills, project),
      maxTokens: cfg.lean ? 700 : 1600,
      effort: 'low',
      timeoutMs: 60000,
    })
    if (!r.isAnswered) {
      await tell($, 'Enhance failed. Draft untouched.', `Enhance failed (${r.reason}). Your draft is untouched.`)
      return `Enhance failed: ${r.reason}.`
    }

    const filled = await $.prompt.fill({ text: cleanOutput(r.text), mode: 'replace' })
    if (!filled.isFilled) {
      await tell($, 'Prompt box busy. Draft untouched.', 'Enhanced, but the prompt box is busy. Your draft is untouched.')
      return 'Prompt box unavailable.'
    }
    await patch($, { original: draft, hasDraft: true })
    lastHasDraft = true
    await safe(() => flash($, 'wand'))
    return 'Enhanced draft placed in the prompt box.'
  } catch (err) {
    await tell($, 'Enhance failed. Draft untouched.')
    return 'Enhance failed.'
  } finally {
    isRunning = false
    mood.writing = false
    poke($)
    await patch($, { isBusy: false })
  }
}

async function undo($: EngineInterface) {
  const { original } = await read($, stateAtom)
  if (original === '') return
  await $.prompt.fill({ text: original, mode: 'replace' })
  await patch($, { original: '' })
}


// ======================= the band =======================

const COLORS = { warn: '#d97706', ok: '#16a34a', dim: '#8b949e', alert: '#FF453A' }

type Snap = {
  m: Model
  now: number
  attention: 0 | 1 | 2
  isOpen: boolean
  isWorking: boolean
  alerts: Alert[]
  saver: { isOn: boolean; last: string | null; usd: number; isStripShown: boolean; lastRouted: boolean }
  advice: Advice[]
  note: Notice | null
  ask: string | null
  enh: EnhancerState
  state: StateId
  bubble: Bubble | null
  clock: string
  mascot: { markup: string; width: number; height: number }
}

/** Reads every feature's state once and decides what is shown and whether the band is open. */
async function snapshot($: EngineInterface, propsWorking: boolean): Promise<Snap> {
  const now = await $.clock.now()
  const m = model({
    fill: await read($, fill),
    limits: await read($, limits),
    now,
    cache: { state: await read($, cache), price: priceOf(await read($, modelId)), soonMin: notifyMin, stepMin: stepMin },
    limitsAt: await read($, lim),
  })
  const isOn = await read($, saverOn)
  const rows = (await read($, isDismissed)) ? [] : await read($, advice)
  const note = await read($, notice)
  const attention = attentionOf(m, rows.length > 0, now)
  const pinned = await read($, pinnedOpen)
  const snoozed = await read($, snooze)
  const isWorking = propsWorking || (await read($, isBusy))
  const today = new Date(now)
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const saved = await read($, saverSaved)
  const routed = await read($, lastRouted)
  const clock = clockOf((await read($, limits)).find(l => l.kind === 'five_hour')?.resetsAt)
  const weekRoom = allottedThrough(now) - m.week.used
  const alerts = alertsOf(m, { saverOn: isOn, now })
  // Redraw when the next limit resets, so a state that depends on it (asleep) ends on time without waiting for a reply.
  const nextReset = Math.min(...(await read($, limits)).map(l => Date.parse(l.resetsAt ?? '')).filter(t => t > now))
  if (Number.isFinite(nextReset) && nextReset !== mood.resetAt) {
    mood.resetAt = nextReset
    $.clock.after(nextReset - now + 1000, () => $.ui.invalidate('ui.render'))
  }
  // A bubble waiting for a decision ends by itself when its warning does (the limit reset, the context was cleared).
  mood.dismissed = mood.dismissed.filter(id => alerts.some(a => a.id === id)) // a warning that ended may speak again when it returns
  if (mood.sticky?.bubble.alertId !== undefined && !alerts.some(a => a.id === mood.sticky?.bubble.alertId)) mood.sticky = null
  const isDemo = mood.demo !== null && mood.demo.until > now
  const picked: StateId =
    mood.demo && mood.demo.until > now
      ? mood.demo.id
      : pickState({
          now,
          waiting: mood.waiting,
          writing: mood.writing || (mood.draftTurn && isWorking && !mood.tool),
          fleet: mood.fleet,
          compacting: mood.compacting,
          tool: mood.tool,
          walkUntil: mood.walkUntil,
          helloUntil: mood.helloUntil,
          ctx: m.ctx.level,
          cache: m.cache?.view.state ?? 'unknown',
          fiveUsed: m.five.used,
          weekRoom,
          hasAdvice: rows.length > 0,
          hasNote: note !== null,
          busy: isWorking,
          busyMs: mood.busySince > 0 ? now - mood.busySince : 0,
          hasTool: mood.hasTool,
        })
  // A state stays on screen at least HOLD_MS, unless one that is more important comes along (a raised hand never waits).
  // While a bubble waits for a decision, an idle Clawd stays in the pose that goes with it (cold, on fire...), not back to idle.
  const wanted: StateId = !isDemo && mood.sticky && (picked === 'idle' || picked === 'talk') ? mood.sticky.state : picked
  const shown = mood.drawn
  const state: StateId = !isDemo && shown && shown.id !== wanted && shown.id !== 'hand' && now - shown.since < HOLD_MS && rank(wanted) >= rank(shown.id) ? shown.id : wanted
  if (!mood.drawn || mood.drawn.id !== state) {
    mood.move = mood.drawn ? { from: mood.drawn.id, to: state } : null
    mood.drawn = { id: state, since: now }
    $.clock.after(HOLD_MS + 80, () => $.ui.invalidate('ui.render'))
  }
  const usd = saved.day === day ? Math.max(0, saved.usd) : 0
  const said = bubbleFor(state, {
    ctxPercent: m.ctx.percent,
    ctxText: m.ctx.legend.text,
    cacheLabel: m.cache?.view.label ?? '',
    fiveUsed: m.five.used,
    fiveReset: clock,
    weekPace: m.week.paceText,
    weekRoom,
    saverOn: isOn,
    detail: state === 'oops' ? mood.failNote : mood.toolNote,
    savedUsd: usd > 0 ? money(usd) : '',
    hasAdvice: rows.length > 0,
  })
  const bubble = said && said.alertId !== undefined && mood.dismissed.includes(said.alertId) ? null : said

  // A bubble that asks for a decision stays until you click its button or send something else; any other lingers a while
  // after its state ends. The raised hand never lingers: it goes the moment you answer.
  let speech: Bubble | null = bubble
  if (isDemo) {
    // A demo shows the state with its own bubble and takes both away together; it leaves nothing pending behind. One
    // state shown alone with a button waits for you to answer it, like the real one.
    if (mood.demo?.single && bubble?.action) mood.demo.until = HELD
  } else if (state === 'hand') {
    mood.linger = null
  } else {
    if (bubble?.action) mood.sticky = { bubble, state }
    if (bubble && (!mood.linger || mood.linger.bubble.text !== bubble.text)) $.clock.after(BUBBLE_LINGER_MS + 80, () => $.ui.invalidate('ui.render'))
    if (bubble) mood.linger = { bubble, until: now + BUBBLE_LINGER_MS, state }
    // A bubble belongs to the state it was said for and follows that state's priority (mood.ts ORDER): the one on screen
    // speaks first; a pending decision or a lingering bubble only speaks when its state outranks the one shown.
    const outranks = (from: StateId) => rank(from) < rank(state)
    if (!bubble) {
      if (mood.sticky && outranks(mood.sticky.state)) speech = mood.sticky.bubble
      else if (mood.linger && mood.linger.until > now && outranks(mood.linger.state)) speech = mood.linger.bubble
      else speech = null
    }
  }
  // A message to you speaks over everything but the raised hand (it is the answer to something you just did).
  if (!isDemo && state !== 'hand' && mood.msg && mood.msg.until > now) speech = { text: mood.msg.text }
  if (!isDemo && speech && speech.text !== mood.lastLogged) remember(now, speech.text)
  mood.shownAlert = isDemo ? null : (speech?.alertId ?? null)
  return {
    m,
    now,
    attention,
    isOpen: pinned || attention > snoozed,
    isWorking,
    alerts,
    saver: { isOn, last: await read($, saverLast), usd: saved.day === day ? Math.max(0, saved.usd) : 0, isStripShown: isStripShown(await read($, stripMode), isOn, routed), lastRouted: routed },
    advice: rows,
    note,
    ask: await read($, pending),
    enh: await read($, stateAtom),
    state,
    bubble: speech,
    clock,
    mascot: mascotMode === 'off' ? { markup: '', width: 0, height: 0 } : mascotFor(state, clock, mood.move, mascotMode === 'small' ? 1 : 2),
  }
}

/** The arrow: open stays open until pressed; pressed while open it collapses until the alert level climbs. */
async function toggle($: EngineInterface, wasOpen: boolean, attention: number): Promise<void> {
  if (wasOpen) {
    await update($, pinnedOpen, () => false)
    await update($, snooze, () => attention)
    await $.store.set('pinnedOpen', false)
  } else {
    await update($, pinnedOpen, () => true)
    await $.store.set('pinnedOpen', true)
  }
}

async function setView($: EngineInterface, value: 'open' | 'close' | 'auto'): Promise<void> {
  await update($, pinnedOpen, () => value === 'open')
  // Closed holds at the top level: nothing short of /cockpit auto (or the arrow) brings it back by itself.
  await update($, snooze, () => (value === 'close' ? 2 : 0))
  await $.store.set('pinnedOpen', value === 'open')
}

type Comps = { Box: never; Text: never; Button: never; Svg?: never }
const el = (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => h(type as never, props as never, ...(children as never[])) as never

/** One alert: its words and the buttons that answer it. Handoff and fresh wait while Claude works. */
const NBSP = '\u00A0'

/**
 * A button in the cockpit gray with dark text, the same as the speech bubble, whatever the app's own button style is.
 * It is a real button whose label carries the color (no drawing with a click area laid over it), so what you see is
 * what you click on every surface. A leading symbol of the label is dropped: it says what it does.
 */
function pill(c: Comps, label: string, props: Record<string, unknown>, fill: { color: string; backgroundColor: string } = { color: '#1b1a19', backgroundColor: C.gray }) {
  const text = label.replace(/^[^\p{L}\p{N}]+/u, '')
  return el(c.Button, { plain: true, ...props }, el(c.Text, fill, `${NBSP}${text}${NBSP}`))
}

/** What each answer to a warning is called, and what pressing it does. */
const ACTION_LABELS: Record<string, string> = { handoff: 'Handoff', copy: 'Copy brief', fresh: 'Fresh', saverOn: 'Saver on', compact: 'Compact' }
function runAction(id: ActionId, fx: Fx): void {
  if (id === 'handoff') fx.handoff('full')
  else if (id === 'copy') fx.handoff('brief')
  else if (id === 'fresh') fx.fresh()
  else if (id === 'compact') fx.compact()
  else fx.saver(true)
}

/** Pressing a button, or sending something else, is the decision a bubble was waiting for. */
function dismissBubble(): void {
  if (mood.demo?.until === HELD) {
    mood.demoRun++
    mood.demo = null
  }
  if (mood.shownAlert && !mood.dismissed.includes(mood.shownAlert)) mood.dismissed.push(mood.shownAlert)
  mood.sticky = null
  mood.linger = null
  mood.msg = null
}

/** One action button; `short` is the compact label used in Clawd's speech bubble. */
function actionButton(id: ActionId, c: Comps, fx: Fx, short: boolean) {
  const go = () => {
    if (short) dismissBubble()
    runAction(id, fx)
  }
  return pill(c, ACTION_LABELS[id] ?? id, { key: id === 'saverOn' ? 'saver' : id, onPress: go })
}

/** One alert: its words and the buttons that answer it. Handoff and fresh wait while Claude works. */
function alertRow(a: Alert, c: Comps, fx: Fx, isWorking: boolean) {
  const tone = a.tone === 'alert' ? COLORS.alert : COLORS.warn
  const wanted = a.actions.filter(id => !(isWorking && id !== 'saverOn'))
  return el(c.Box, { key: `alert-${a.id}`, flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap' }, el(c.Text, { key: 't', color: tone }, `● ${a.text}`), ...wanted.map(id => actionButton(id, c, fx, false)))
}

/** On the terminal the speech bubble is a line of text above the band (the desktop draws it as pixels inside the band). */
function bubbleFloat(b: Bubble, c: Comps, fx: Fx, isWorking: boolean) {
  const items: unknown[] = [el(c.Text, { key: 't' }, b.text)]
  if (b.action && !(isWorking && b.action !== 'saverOn')) items.push(actionButton(b.action, c, fx, true))
  return el(c.Box, { key: 'bubble', flexDirection: 'row', alignItems: 'center', gap: 1, paddingLeft: 3 }, ...items)
}

/** Clawd's speech bubble: what he is reacting to, and the button that answers it when there is one. */
function bubbleRow(b: Bubble, c: Comps, fx: Fx, isWorking: boolean) {
  const items: unknown[] = [el(c.Text, { key: 'tail', dimColor: true }, '◂'), el(c.Text, { key: 't' }, b.text)]
  if (b.action && !(isWorking && b.action !== 'saverOn')) items.push(actionButton(b.action, c, fx, true))
  return el(c.Box, { key: 'bubble', flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap' }, ...items)
}

const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`

/** One preflight finding with its buttons (the same buttons the standalone mod had). */
function adviceRow(a: Advice, ask: string | null, c: Comps, fx: Fx, more = 0) {
  const isWarn = a.kind !== 'peer-working'
  const id = `${a.kind}-${'peerId' in a ? a.peerId : ''}`
  const asking = a.kind === 'peer-done' && ask === a.peerId
  const items: unknown[] = [
    el(c.Text, { key: 't', color: isWarn ? COLORS.warn : COLORS.dim }, asking && a.kind === 'peer-done' ? `Commit ${files(a.take)} on ${a.branch}? Not pushed.` : `● ${label(a)}${more > 0 ? ` (+${more} more)` : ''}`),
  ]
  if (a.kind === 'shared-folder' || a.kind === 'main') items.push(pill(c, '⇄ New worktree', { key: `wt-${a.kind}`, onPress: () => fx.newWorktree() }))
  if (a.kind === 'dirty') items.push(pill(c, a.onDefault ? '✓ Commit to new branch' : '✓ Commit checkpoint', { key: 'cp', onPress: () => fx.checkpoint(a.onDefault) }))
  if (a.kind === 'peer-done' && a.take > 0) {
    if (asking) {
      items.push(pill(c, '✓ Yes, commit', { key: 'yes', onPress: () => fx.commitPeer(a.peerId) }))
      items.push(pill(c, '✕ No', { key: 'no', onPress: () => fx.askCommit(null) }))
    } else {
      items.push(pill(c, '✓ Commit its files', { key: 'ask', onPress: () => fx.askCommit(a.peerId) }))
    }
  }
  return el(c.Box, { key: id, flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap' }, ...items)
}

function noticeRow(n: Notice, c: Comps, fx: Fx, surface: string) {
  const items: unknown[] = [el(c.Text, { key: 'note', color: n.isError ? COLORS.warn : COLORS.ok }, `${n.isError ? '! ' : '✓ '}${n.text}`)]
  if (n.text.startsWith('Worktree ready')) {
    items.push(pill(c, '➜ Switch', { key: 'sw', onPress: () => fx.switchInto() }))
    items.push(pill(c, '❐ Copy path', { key: 'copy', onPress: () => fx.copyWorktree(surface) }))
  }
  items.push(pill(c, '✓ OK', { key: 'ok', onPress: () => fx.dismissNotice() }))
  return el(c.Box, { key: 'notice', flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap' }, ...items)
}

/** The saver line: only while it routed the last answer to Haiku in the collapsed band, always when open. */
function saverRow(s: Snap, c: Comps, fx: Fx) {
  const dim = s.saver.isOn ? COLOR.dim : COLOR.track
  return el(
    c.Box,
    { key: 'saver', flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap' },
    el(c.Text, { key: 'dot', color: s.saver.isOn ? COLOR.green : COLOR.track }, '●'),
    el(c.Text, { key: 't', color: dim }, `Saver ${s.saver.isOn ? 'on' : 'off'}  |  answered by ${s.saver.last ? shortName(s.saver.last) : '-'}  |  saved today ${money(s.saver.usd)}`),
    pill(c, s.saver.isOn ? '⚡ Saver off' : '⚡ Saver on', { key: 'saver-toggle', onPress: () => fx.saver(!s.saver.isOn) }),
  )
}

/** The wand as a text glyph with the text-presentation selector (U+FE0E), drawn white: a font outline, not the colour emoji. A Button takes only strings and Text, never an Svg. */
const WAND = '\u{1FA84}\uFE0E'

/** The small controls at the right of the row: enhance, undo, and the arrow. */
function controls(s: Snap, c: Comps, fx: Fx, onToggle: () => void, Svg: unknown = null) {
  const tip = (text: string) => el(c.Box, { position: 'absolute', top: -1, right: 0, display: 'none', hover: { display: 'flex' } }, el(c.Text, { dimColor: true }, text))
  const items: unknown[] = []
  if (s.enh.isBusy) items.push(el(c.Text, { key: 'busy', dimColor: true }, `${WAND} enhancing…`))
  else {
    if (s.enh.original !== '') items.push(el(c.Box, { key: 'undo-wrap' }, el(c.Button, { key: 'undo', plain: true, dimColor: true, onPress: () => fx.undoEnhance() }, '↩'), tip('Restore my draft')))
    const tipText = `Enhance${enhanceLabel ? ` (${enhanceLabel})` : ''}`
    if (Svg) {
      // A Button cannot hold a drawing: the flat white wand is an Svg, with a plain button of blank text laid over it.
      const wand = wandSvg(!s.enh.hasDraft)
      items.push(
        el(c.Box, { key: 'enhance-wrap', position: 'relative' }, el(Svg as never, { key: 'wand', source: wand.source, alt: 'Enhance my draft', width: wand.width, height: wand.height }), el(c.Box, { key: 'wand-hit', position: 'absolute', top: 0, left: 0 }, el(c.Button, { key: 'enhance', plain: true, onPress: () => fx.enhance() }, '\u00A0\u00A0\u00A0')), tip(tipText)),
      )
    } else items.push(el(c.Box, { key: 'enhance-wrap' }, el(c.Button, { key: 'enhance', dimColor: !s.enh.hasDraft, onPress: () => fx.enhance() }, el(c.Text, { color: 'white' }, WAND)), tip(tipText)))
  }
  items.push(el(c.Box, { key: 'toggle-wrap' }, el(c.Button, { key: 'toggle', plain: true, dimColor: true, onPress: onToggle }, s.isOpen ? '▴' : '▾'), tip(s.isOpen ? 'Hide details' : 'Show details')))
  return el(c.Box, { key: 'controls', flexDirection: 'row', alignItems: 'center', gap: 2, paddingX: 1 }, ...items)
}

/** What sits under the main row: alerts, preflight, notice, saver. Collapsed shows only what needs you. */
function details(s: Snap, c: Comps, fx: Fx, surface: string) {
  const rows: unknown[] = []
  // An open band already shows the alert the bubble stands for, with its buttons: say it once.
  if (bubbleMode === 'inline' && s.bubble && !(s.isOpen && s.bubble.alertId !== undefined && s.alerts.some(a => a.id === s.bubble?.alertId))) rows.push(bubbleRow(s.bubble, c, fx, s.isWorking))
  if (s.isOpen) for (const a of s.alerts) rows.push(alertRow(a, c, fx, s.isWorking))
  if (s.note) rows.push(noticeRow(s.note, c, fx, surface))
  else if (!s.isWorking) {
    // Collapsed: the first finding only, with the count of the others in its own line; the rest wait in the open band.
    const list = s.isOpen ? s.advice : s.advice.slice(0, 1)
    for (const a of list) rows.push(adviceRow(a, s.ask, c, fx, !s.isOpen && s.advice.length > 1 ? s.advice.length - 1 : 0))
    if (list.length > 0) rows.push(pill(c, '✕ Hide', { key: 'hide', onPress: () => fx.hideAdvice() }))
  }
  // The saver's own line is for the open band; when it routes a step the bubble says so and fades.
  if (s.isOpen) rows.push(saverRow(s, c, fx))
  return rows
}


// ======================= wiring: one hook per event, each calling the sections =======================

type Fx = {
  handoff: (mode: HandoffMode) => void
  fresh: () => void
  compact: () => void
  saver: (on: boolean) => void
  enhance: () => void
  undoEnhance: () => void
  newWorktree: () => void
  switchInto: () => void
  copyWorktree: (surface: string) => void
  checkpoint: (onDefault: boolean) => void
  askCommit: (peerId: string | null) => void
  commitPeer: (peerId: string) => void
  hideAdvice: () => void
  dismissNotice: () => void
}

/** What the band's buttons do; every one passes `$` only to a function declared above. */
function makeFx($: EngineInterface): Fx {
  const then = (fn: () => Promise<void>) => () =>
    void (async () => {
      await fn()
      await refresh($)
    })()
  return {
    handoff: mode => void handoff($, mode),
    fresh: () => void fresh($),
    compact: () => void compactNow($),
    saver: on => void setSaver($, on),
    enhance: () => void enhance($, enhancerCfg),
    undoEnhance: () => void undo($),
    newWorktree: then(() => newWorktree($, S.selfId)),
    switchInto: () => void switchInto($),
    copyWorktree: surface => void $.store.get('lastWorktree').then(p => $.ui.copy({ text: String(p ?? ''), surface: surface as never })),
    checkpoint: onDefault => then(() => checkpoint($, onDefault))(),
    askCommit: peerId => void update($, pending, () => peerId),
    commitPeer: peerId => then(() => commitPeer($, peerId))(),
    hideAdvice: () => void update($, isDismissed, () => true),
    dismissNotice: () => void update($, notice, () => null),
  }
}

const tryRegister = async ($: EngineInterface, c: { name: string; description: string; argumentHint?: string }): Promise<boolean> => {
  try {
    await $.command.register(c)
    return true
  } catch {
    // The app refuses a name another command or skill already holds; the buttons and /cockpit still work.
    return false
  }
}

async function startMeters($: EngineInterface): Promise<void> {
  // Each command on its own: one refusal must not stop the others. /meters is the fallback for every other
  // command (/meters cache, /meters handoff, /meters fresh) and says what was refused.
  failed.length = 0
  const cmds: [string, string, string?][] = [
    ['meters', 'Usage meters: /meters side, top, cache, handoff, brief, fresh, limits or status', 'side|top|cache|handoff|brief|fresh|limits|status'],
    ['cache', 'Prompt cache window: /cache shows it, /cache <minutes> sets it, /cache auto learns it', '<minutes>|auto'],
    ['fresh', 'Clear the session and start fresh, no handoff'],
    ['newsession', 'Write a handoff brief, clear the session, paste it into the fresh one. /newsession brief keeps the session; /newsession paste re-pastes the last', 'brief|paste'],
  ]
  for (const [name, description, argumentHint] of cmds) if (!(await tryRegister($, { name, description, argumentHint }))) failed.push(name)

  await limitsReport($, '', defaults)

  const usage = await $.session.usage()
  await update($, limits, () => usage.rateLimits)
  const { tokens, window, percent } = usage.context
  if (tokens !== undefined && percent !== undefined) await update($, fill, () => ({ tokens, window, percent }))

  const override = await $.store.get('cacheOverride')
  const detected = await $.store.get('cacheDetected')
  await patchCache($, c => ({
    ...c,
    fallback: fallbackMin,
    override: typeof override === 'number' ? override : null,
    detected: detected === 5 || detected === 60 ? detected : c.detected,
  }))

  if ((await $.store.get('isSide')) === true) {
    await update($, isSide, () => true)
    void $.ui.open({ id: PANE, title: 'Cockpit' })
  }

  $.clock.every(15_000, () => void pulse($, notifyMin, stepMin))
}

async function startSaver($: EngineInterface): Promise<void> {
  await tryRegister($, { name: 'saver', description: 'Route easy prompts to Haiku 5.5: /saver on or /saver off', argumentHint: 'on|off' })
  const storedOn = await $.store.get('saverOn')
  if (typeof storedOn === 'boolean') await update($, saverOn, () => storedOn)
  const storedMode = parseMode(await $.store.get('stripMode'))
  if (storedMode) await update($, stripMode, () => storedMode)
  const storedSaved = (await $.store.get('saved')) as Saved | undefined
  if (storedSaved && typeof storedSaved.usd === 'number') await update($, saverSaved, () => storedSaved)
}

async function startPreflight($: EngineInterface): Promise<void> {
  S.selfId = await $.session.id()
  await tryRegister($, { name: 'preflight', description: 'Check main, uncommitted changes and other sessions: /preflight, /preflight off|on', argumentHint: 'off|on' })
  const stored = await $.store.get('preflightOn')
  if (typeof stored === 'boolean') await update($, preflightOn, () => stored)
  // After the session is up, so git never delays the start.
  $.clock.after(1500, () => void beat($, 'idle').then(() => refresh($)))
  $.clock.every(60_000, () => void refresh($))
}

async function startEnhancer($: EngineInterface): Promise<void> {
  await tryRegister($, { name: 'enhance', description: 'Rewrite a draft prompt with fitting skills, project context, questions and a definition of done.', argumentHint: '<draft>' })
}

async function startBand($: EngineInterface): Promise<void> {
  await tryRegister($, { name: 'cockpit', description: 'The band above the prompt: /cockpit open, close or auto (open when something needs you)', argumentHint: 'open|close|auto|mascot|bubble|log|demo' })
  if ((await $.store.get('pinnedOpen')) === true) await update($, pinnedOpen, () => true)
  const storedBubble = await $.store.get('bubbleMode')
  if (storedBubble === 'float' || storedBubble === 'inline') bubbleMode = storedBubble
  const storedMascot = await $.store.get('mascot')
  if (storedMascot === 'normal' || storedMascot === 'small' || storedMascot === 'off') mascotMode = storedMascot
  mood.walkUntil = (await $.clock.now()) + START_MS
  mood.isFirstPrompt = true
  poke($, START_MS)
}

export const register: Register = (on, options) => {
  defaults = thresholds(options)
  askMs = Math.max(1, Number(options.askSeconds) || 5) * 1000
  fallbackMin = Math.max(1, Number(options.cacheMinutes ?? 60) || 60)
  notifyMin = Math.max(1, Number(options.notifyMinutes ?? 5) || 5)
  stepMin = Math.max(1, Number(options.cacheStepMinutes ?? 5) || 5)
  handoffLabel = typeof options.handoffKey === 'string' ? options.handoffKey : 'meta+h'
  freshLabel = typeof options.freshKey === 'string' ? options.freshKey : 'meta+n'
  handoffChord = parseChord(handoffLabel)
  freshChord = parseChord(freshLabel)
  hasSound = options.sound !== false
  hasLog = options.turnLog !== false
  mascotMode = options.mascot === 'small' || options.mascot === 'off' ? options.mascot : 'normal'
  enhanceLabel = typeof options.hotkey === 'string' ? options.hotkey : 'meta+e'
  enhancerChord = parseEnhancerChord(enhanceLabel)
  enhancerCfg = {
    model: typeof options.model === 'string' && options.model.trim() !== '' ? options.model.trim() : 'haiku',
    maxSkills: Math.max(1, Number(options.maxSkills ?? 12) || 12),
    lean: options.enhanceStyle === 'lean',
  }

  on('session.start', async ($, e, next) => {
    await safe(() => startMeters($))
    await safe(() => startSaver($))
    await safe(() => startPreflight($))
    await safe(() => startEnhancer($))
    await safe(() => startBand($))
    return next(e)
  })

  // The engine pushes every change of the window's fill and of the account's limits.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const { tokens, window, percent } = e.context
      const value = tokens === undefined || percent === undefined ? null : { tokens, window, percent }
      await update($, fill, () => value)
    }
    if (e.changed.includes('rateLimits')) await update($, limits, () => e.rateLimits)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // A /clear starts the context over: the old prefix is not what the next request re-reads.
    if (e.reason === 'clear') await patchCache($, c => ({ ...c, lastAt: 0, lastEndAt: 0, notifiedAt: 0 }))
    await safe(() => beat($, 'ended'))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isBusy, () => true)
      mood.busySince = await $.clock.now()
      mood.hasTool = false
      mood.waiting = false
      mood.tool = null
      mood.toolNote = ''
      poke($, COFFEE_AFTER_MS + 500)
    }
    void beat($, 'working')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isBusy, () => false)
      mood.draftTurn = false
      mood.waiting = false
      mood.askAt = 0
      mood.askId = ''
      mood.tool = null
      mood.compacting = false
      if (hasLog) await safe(() => logTurn($, e))
      if (hasSound && e.reason !== 'aborted') await chime($)
      if (e.reason !== 'aborted') await safe(() => flash($, 'bell'))
      else poke($)
    }
    await safe(() => beat($, 'idle'))
    void refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Sending a message restarts the cache countdown (the next request re-reads or re-writes the whole prefix)
  // and labels the turn for the saver; the enhancer's draft is spent. Commands and hidden prompts send nothing.
  on('prompt.submit', async ($, e, next) => {
    if (/^\s*\/(?:[\w.-]+:)?handoff\b/i.test(String(e.text ?? ''))) mood.draftTurn = true
    if (!e.command && !e.isMeta) dismissBubble()
    await safe(async () => {
      // A command, a hidden prompt, or one folded into a running turn keeps the turn's label.
      if (e.command || e.isMeta || e.turnId !== undefined) return
      turnLevel = 'hard'
      if (!(await read($, saverOn))) why = 'Saver is off: every prompt stays on your model.'
      else {
        turnLevel = labelLocally(e.text)
        if (turnLevel === 'unclear') {
          try {
            const verdict = await $.model.classify(e.text, ['easy', 'hard'], { model: HAIKU_ID })
            turnLevel = verdict === 'easy' ? 'easy' : 'hard'
          } catch {
            turnLevel = 'hard'
          }
        }
      }
    })
    await safe(async () => {
      // The countdown restarts when a message goes to the main model. An easy one the saver will route to Haiku leaves the
      // main model's cache alone (turn.step restarts it if the routing does not happen after all).
      if (e.command || e.isMeta) return
      const routed = turnLevel === 'easy' && (await read($, saverOn)) && !(await read($, modelId)).toLowerCase().includes('haiku')
      if (routed) return
      const now = await $.clock.now()
      await patchCache($, c => ({ ...c, lastAt: now }))
    })
    await safe(async () => {
      lastHasDraft = false
      await patch($, { hasDraft: false, original: '' })
    })
    await safe(async () => {
      if (e.command || e.isMeta || !mood.isFirstPrompt) return
      mood.isFirstPrompt = false
      mood.helloUntil = (await $.clock.now()) + START_MS
      poke($, START_MS)
    })
    return next(e)
  })

  // Every main-loop request touches the prompt cache and may be routed to Haiku by the saver. The API does not
  // report the cache TTL, so the window is learned from what the first request after an idle gap read from it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    mood.waiting = false
    mood.askAt = 0
    mood.askId = ''
    const before = await read($, cache)
    const startedAt = await $.clock.now()
    let isHaiku = false
    if (turnLevel !== 'easy') why = `Stayed on ${e.model}: the prompt was labelled ${turnLevel}.`
    else if (e.model.toLowerCase().includes('haiku')) why = `Nothing to route: the session model is already ${e.model}.`
    if (turnLevel === 'easy' && !e.model.toLowerCase().includes('haiku')) {
      let tokens = 0
      try {
        tokens = (await $.session.usage()).context.tokens ?? 0
      } catch {
        tokens = CONTEXT_LIMIT
      }
      isHaiku = (await read($, saverOn)) && tokens < CONTEXT_LIMIT
      why = isHaiku ? `Routed to ${HAIKU_ID}: labelled easy, context ${tokens} tokens (< ${CONTEXT_LIMIT}), your model ${e.model}.` : `Stayed on ${e.model}: labelled easy but context is ${tokens} tokens (>= ${CONTEXT_LIMIT}) or saver is off.`
    }

    // The prompt cache belongs to a model: a step routed to Haiku neither reads nor refreshes the main model's cache, so
    // only a main-model request restarts the window (and teaches it).
    const mainWarm = (() => {
      const state = cacheView(before, startedAt, 0, null).state
      return before.lastAt > 0 && (state === 'warm' || state === 'soon')
    })()
    if (!isHaiku) await patchCache($, c => ({ ...c, lastAt: startedAt }))
    const response = yield* next(isHaiku ? { ...e, model: HAIKU_ID } : e)
    const endedAt = await $.clock.now()

    await safe(async () => {
      await update($, lastRouted, () => isHaiku)
      if (isHaiku) await flash($, 'coins')
      await update($, saverLast, () => response.usage?.model ?? (isHaiku ? HAIKU_ID : e.model))
      const mainPrice = priceOf(e.model)
      if (isHaiku && response.usage && mainPrice) {
        const gain = realSaving(mainPrice, response.usage, mainWarm)
        const today = dayKey(await $.clock.now())
        const total = await update($, saverSaved, s => (s.day === today ? { day: today, usd: s.usd + gain } : { day: today, usd: gain }))
        await $.store.set('saved', total)
      }
    })
    await safe(async () => {
      if (e.model !== (await read($, modelId))) await update($, modelId, () => e.model)
      const u = response.usage
      if (u && !isHaiku) {
        // The idle gap is measured from the end of the previous request, not from its start.
        const gap = before.lastEndAt > 0 ? startedAt - before.lastEndAt : 0
        await patchCache($, c => ({
          ...(gap > 0 ? learnWindow(c, gap, { input: u.input_tokens, read: u.cache_read_input_tokens, create: u.cache_creation_input_tokens }) : c),
          lastEndAt: endedAt,
        }))
        if (gap > 0) {
          const learned = (await read($, cache)).detected
          if (learned !== null) await $.store.set('cacheDetected', learned)
        }
      }
    })
    return response
  })

  // The engine itself says which TTL the session's cache has whenever the model is switched.
  on('classic.PreModelSwitch', async ($, e, next) => {
    const ttl = e.cache_ttl === '1h' ? 60 : e.cache_ttl === '5m' ? 5 : null
    if (ttl !== null) {
      await patchCache($, c => ({ ...c, detected: ttl, misses: 0 }))
      await $.store.set('cacheDetected', ttl)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The prompt cache belongs to a model: after a switch the new model starts with none, whatever the countdown said.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await patchCache($, c => ({ ...c, lastAt: 0, lastEndAt: 0, notifiedAt: 0 }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    if (matchesChord(handoffChord, e.key)) {
      $.clock.after(0, () => void handoff($, 'full'))
      return { text: e.text, cursor: e.cursor }
    }
    if (matchesChord(freshChord, e.key)) {
      $.clock.after(0, () => void fresh($))
      return { text: e.text, cursor: e.cursor }
    }
    if (matchesEnhancerChord(enhancerChord, e.key)) {
      $.clock.after(0, () => void enhance($, enhancerCfg))
      return { text: e.text, cursor: e.cursor }
    }
    const r = await next(e)
    await safe(() => setDraft($, r.text))
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { tool?: string; file_path?: string; notebook_path?: string }
    const tool = String(input.tool ?? '')
    if ((WRITE_TOOLS as readonly string[]).includes(tool)) {
      const file = String(input.file_path ?? input.notebook_path ?? '')
      void (async () => {
        const repo = await repoOf($)
        const rel = repo && file !== '' ? relativeTo(repo.root, file) : null
        await beat($, 'working', rel ? [rel] : [])
      })()
    } else if ((await $.clock.now()) - S.lastWrite > 30_000) {
      void beat($, 'working')
    }
    toolStarts($, input)
    const r = await next(e)
    await safe(() => toolEnds($, input, r as { isError?: boolean }))
    return r
  }).catch(($, e, next) => next(e))

  // A permission prompt is about to be put to the person: Clawd raises a hand until the call runs or the turn moves on.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // A query (another plugin's $.tool.check) has no tool_use_id: nothing will run and nobody is asked, so it never counts.
    if (r.decision === 'ask' && e.tool_use_id !== undefined) {
      // An ask is often settled by a rule or the mode before anyone is shown a prompt: only one still open after a moment counts.
      const at = await $.clock.now()
      mood.askAt = at
      mood.askId = e.tool_use_id
      $.clock.after(askMs, () => {
        if (mood.askAt === at) {
          mood.waiting = true
          poke($)
        }
      })
    }
    return r
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    mood.compacting = true
    poke($)
    try {
      return await next(e)
    } finally {
      mood.compacting = false
      poke($)
    }
  })

  on('mcp.connect', async ($, e, next) => {
    const r = await next(e)
    const v = 'value' in r ? r.value : undefined
    if (v && v.isConnected === false && v.reason === 'failed') await safe(() => flash($, 'plug'))
    return r
  }).catch(($, e, next) => next(e))

  // ---- commands
  on('command.run', { command: 'meters' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'side') {
      await $.store.set('isSide', true)
      await update($, isSide, () => true)
      const opened = await $.ui.open({ id: PANE, title: 'Cockpit' })
      await update($, tick, n => n + 1)
      return {
        text: opened.isPlaced ? 'Cockpit moved to a side panel. Use /meters top to bring the band back.' : `The side panel is not drawn here (${opened.reason}); the band above the prompt stays.`,
      }
    }

    if (arg === 'top') {
      await $.store.set('isSide', false)
      await update($, isSide, () => false)
      await $.ui.close({ id: PANE })
      await update($, tick, n => n + 1)
      return { text: 'Cockpit back in the band above the prompt.' }
    }

    if (/^(warn|red|tokens|limits)\b/.test(arg)) return { text: await limitsReport($, arg, defaults) }

    if (arg === 'status') {
      const names = ['meters', 'cache', 'fresh', 'newsession']
      const ok = names.filter(n => !failed.includes(n))
      return { text: `Commands registered: ${ok.map(n => '/' + n).join(' ') || 'none'}.${failed.length ? ` Refused by the app: ${failed.map(n => '/' + n).join(' ')} (another command or skill holds the name; use /meters ${failed.includes('cache') ? 'cache' : failed.includes('fresh') ? 'fresh' : 'handoff'} instead).` : ''}` }
    }

    if (arg === 'cache' || arg.startsWith('cache ')) return { text: await cacheReport($, arg.slice(5), notifyMin, stepMin) }

    if (arg === 'handoff' || arg.startsWith('handoff ')) {
      const m = handoffMode(arg.slice(7))
      $.clock.after(0, () => void handoff($, m))
      return { text: handoffSays(m) }
    }

    if (arg === 'brief') {
      $.clock.after(0, () => void handoff($, 'brief'))
      return { text: handoffSays('brief') }
    }

    if (arg === 'fresh') {
      $.clock.after(0, () => void fresh($))
      return { text: 'Starting a fresh session…' }
    }

    return { text: 'Use /meters side, top, cache, handoff, brief, fresh, limits or status.' }
  })

  on('command.run', { command: 'newsession' }, async ($, e) => {
    const m = handoffMode(e.args)
    $.clock.after(0, () => void handoff($, m))
    return { text: handoffSays(m) }
  })

  on('command.run', { command: 'fresh' }, async $ => {
    $.clock.after(0, () => void fresh($))
    return { text: 'Starting a fresh session…' }
  })

  on('command.run', { command: 'cache' }, async ($, e) => ({ text: await cacheReport($, e.args, notifyMin, stepMin) }))

  on('command.run', { command: 'saver' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await setSaver($, arg === 'on')
      return { text: `saver ${arg}` }
    }
    if (arg === 'why') return { text: why }
    if (arg.startsWith('strip')) {
      const wanted = parseMode(arg.slice(5).trim())
      if (!wanted) return { text: 'Use /saver strip active (only when it just routed to Haiku), /saver strip on (whenever saver is on) or /saver strip always.' }
      await $.store.set('stripMode', wanted)
      await update($, stripMode, () => wanted)
      return { text: `The saver line now shows: ${wanted === 'active' ? 'only when the last answer was routed to Haiku' : wanted === 'on' ? 'whenever saver is on' : 'always, even when off'}.` }
    }
    const state = (await read($, saverOn)) ? 'on' : 'off'
    return { text: `saver is ${state}; the line shows ${await read($, stripMode)}. Use /saver on, /saver off, /saver why or /saver strip active|on|always.` }
  })

  on('command.run', { command: 'preflight' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, preflightOn, () => arg === 'on')
      await $.store.set('preflightOn', arg === 'on')
      await refresh($)
      return { text: `Preflight ${arg}.` }
    }
    await update($, isDismissed, () => false)
    await refresh($)
    const list = await read($, advice)
    return { text: list.length === 0 ? 'All clear: not on main, nothing uncommitted, no other session in the way.' : list.map(label).join('\n') }
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const draft = e.args.trim()
    if (draft === '') return { text: `Type a draft, then press ${WAND}${enhancerChord ? ` or ${enhanceLabel}` : ''}. Or run /enhance <draft>.` }
    return { text: await enhance($, enhancerCfg, draft) }
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'demo' || arg.startsWith('demo ')) {
      const which = arg.slice(4).trim()
      if (which === 'off') {
        mood.demoRun++
        mood.demo = null
        poke($)
        return { text: 'Demo stopped.' }
      }
      const ids = which === '' ? STATE_IDS : STATE_IDS.filter(id => id === which)
      if (ids.length === 0) return { text: `No state called "${which}". They are: ${STATE_IDS.join(', ')}.` }
      void demoLoop($, [...ids])
      return { text: `Showing ${ids.length === 1 ? ids[0] : `all ${ids.length} states`}, 4 seconds each. /cockpit demo off stops it.` }
    }
    if (arg === 'log') {
      const path = String((await $.store.get('lastBriefPath')) ?? '')
      const lines = mood.history.length > 0 ? mood.history.join('\n') : 'Nothing said yet.'
      return { text: `${lines}${path !== '' ? `\nLast handoff brief: ${path}` : ''}` }
    }
    if (arg === 'bubble' || arg.startsWith('bubble ')) {
      const wanted = arg.slice(6).trim()
      if (wanted !== 'float' && wanted !== 'inline') return { text: `The speech bubble is ${bubbleMode}. Use /cockpit bubble float (a pixel bubble above Clawd) or inline (a text row under the band).` }
      bubbleMode = wanted
      await $.store.set('bubbleMode', wanted)
      poke($)
      return { text: wanted === 'float' ? 'The speech bubble is a pixel bubble above Clawd.' : 'The speech bubble is a row under the band.' }
    }
    if (arg === 'mascot' || arg.startsWith('mascot ')) {
      const wanted = arg.slice(6).trim()
      if (wanted !== 'on' && wanted !== 'normal' && wanted !== 'small' && wanted !== 'off') return { text: `Clawd is ${mascotMode === 'normal' ? 'full size' : mascotMode}. Use /cockpit mascot on, small or off.` }
      mascotMode = wanted === 'on' ? 'normal' : wanted
      await $.store.set('mascot', mascotMode)
      poke($)
      return { text: mascotMode === 'off' ? 'Clawd is hidden. The speech bubble and the meters stay. /cockpit mascot on brings him back.' : mascotMode === 'small' ? 'Clawd is small.' : 'Clawd is full size.' }
    }
    if (arg === 'open' || arg === 'close' || arg === 'auto') {
      await setView($, arg)
      return { text: arg === 'open' ? 'Cockpit kept open.' : arg === 'close' ? 'Cockpit collapsed. /cockpit auto lets it open by itself again.' : 'Cockpit opens by itself when something needs you.' }
    }
    return { text: `Cockpit is ${(await read($, pinnedOpen)) ? 'pinned open' : 'automatic'}. Use /cockpit open, close or auto, /cockpit mascot on, small or off, /cockpit bubble float or inline, /cockpit log for what the bubble said lately, or /cockpit demo [state] to see Clawd's states.` }
  })

  // The person closed the side panel with its own close mark: remember it, or the next session reopens it.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await $.store.set('isSide', false)
      await update($, isSide, () => false)
      await update($, tick, n => n + 1)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---- the band
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    await read($, tick)
    if (await read($, isSide)) {
      try {
        const panes = await $.ui.panes()
        if (panes.some(p => p.id === PANE && p.isPlaced)) return below
      } catch {
        // No way to tell: draw the band.
      }
    }

    let s: Snap
    try {
      s = await snapshot($, e.props.isWorking)
    } catch (err) {
      // A drawing that cannot be built must not blank the band without a word: say what failed.
      const { Box: B, Text: T } = $.ui.resolve(e)
      const c0 = { Box: B, Text: T } as unknown as Comps
      return stack(below, el(c0.Box, { key: bandKey('cockpit') }, el(c0.Text, { color: '#e2553f' }, `Cockpit could not draw: ${err instanceof Error ? err.message : String(err)}`)) as never, B)
    }
    // A collapse only holds while the alert level stays where it was; once calm, forget it.
    if (s.attention === 0 && (await read($, snooze)) !== 0) $.clock.after(0, () => void update($, snooze, () => 0))

    const { Box, Text, Button } = $.ui.resolve(e)
    const Draw = ($.ui.resolve(e) as { Svg?: unknown }).Svg
    const c = { Box, Text, Button, Svg: e.surface === 'terminal' ? undefined : Draw } as unknown as Comps
    const fx = makeFx($)
    const onToggle = () => void toggle($, s.isOpen, s.attention)

    const speaks = bubbleMode === 'float' && s.bubble !== null && !(s.isOpen && s.bubble.alertId !== undefined && s.alerts.some(a => a.id === s.bubble?.alertId))
    let row
    if (e.surface === 'terminal') {
      row = el(c.Box, { key: 'row', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, el(c.Box, { key: 'meters' }, ...(mascotMode === 'off' ? [] : [el(c.Text, { key: 'face', dimColor: true }, `${STATES[s.state].face}  `)]), ...line(s.m).map((seg, i) => el(c.Text, { key: `s${i}`, color: seg.fill }, seg.t))), controls(s, c, fx, onToggle))
    } else {
      const Svg = ($.ui.resolve(e) as { Svg: unknown }).Svg
      // The bubble is drawn inside the band's own drawing, over the meters: the band never grows for it.
      const said = speaks && s.bubble ? s.bubble.text : null
      // A bubble with a button is drawn apart from the band's drawing and laid out in a row with its real button: the
      // click area is the button itself, never a guessed spot over a drawing.
      const act = speaks && s.bubble?.action && !(s.isWorking && s.bubble.action !== 'saverOn') ? s.bubble.action : null
      // When it has nothing to say it fades out of the same drawing (invisible) instead of being redrawn away.
      if (said && !act) mood.lastSaid = said
      else if (act) mood.lastSaid = null
      const speech = said ? { text: said, phase: 'in' as const, apart: act !== null } : mood.lastSaid ? { text: mood.lastSaid, phase: 'out' as const } : null
      const svg = cockpitSvg(Math.max(300, bandWidth(e.props.bodyColumns) - 90), s.m, s.mascot, speech)
      const bb = svg.bubbleBox
      const label = act ? (ACTION_LABELS[act] ?? act) : ''
      const art = act && said && bb ? bubbleSvg(said, bb.w) : null
      const apart = act && said && art && bb ? [el(c.Box, { key: 'bubble', position: 'absolute', top: Math.max(0, Math.floor((bb.y - 6) / 18)), left: Math.max(0, Math.floor((bb.x - 8) / 8)), flexDirection: 'row', alignItems: 'center' }, el(Svg, { key: 'bubble-art', source: art.source, alt: said, isInteractive: true, width: art.width, height: art.height }), pill(c, label, { key: act === 'saverOn' ? 'saver' : act, onPress: () => { dismissBubble(); runAction(act, fx) } }, { color: '#ece8e1', backgroundColor: '#2b2a28' }))] : []
      // An interactive Svg is drawn in a frame of its own: give it its real size, or the frame is far taller than the drawing.
      row = el(c.Box, { key: 'row', position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, el(Svg, { key: 'svg', source: svg.source, alt: `${STATES[s.state].label}. ${said ? `${said}. ` : ''}${altText(s.m)}`, isInteractive: true, width: svg.width, height: svg.height }), controls(s, c, fx, onToggle, Svg), ...apart)
    }

    const mine = el(c.Box, { key: bandKey('cockpit'), flexDirection: 'column' }, ...(speaks && s.bubble && e.surface === 'terminal' ? [bubbleFloat(s.bubble, c, fx, s.isWorking)] : []), row, ...(details(s, c, fx, e.surface) as never[]))
    return stack(below, mine as never, Box)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await snapshot($, false)
    const { Box, Text, Button } = $.ui.resolve(e)
    const Draw = ($.ui.resolve(e) as { Svg?: unknown }).Svg
    const c = { Box, Text, Button, Svg: e.surface === 'terminal' ? undefined : Draw } as unknown as Comps
    const fx = makeFx($)
    const rows = details({ ...s, isOpen: true }, c, fx, e.surface)
    if (e.surface === 'terminal') {
      return el(c.Box, { flexDirection: 'column' }, ...line(s.m, 6).map((seg, i) => el(c.Text, { key: `s${i}`, color: seg.fill }, seg.t)), ...(rows as never[]))
    }
    const { Svg } = $.ui.resolve(e)
    const dock = e.props.placement === 'dock'
    const svg = dock ? sideSvg(sideWidth(e.props.bodyColumns), s.m) : cockpitSvg(bandWidth(e.props.bodyColumns), s.m, s.mascot)
    return el(
      c.Box,
      { flexDirection: 'column' },
      el(c.Box, { key: 'svg', justifyContent: 'center' }, dock ? el(Svg, { source: svg.source, alt: altText(s.m), width: svg.width, height: svg.height }) : el(Svg, { source: svg.source, alt: altText(s.m), isInteractive: true, width: svg.width, height: svg.height })),
      ...(rows as never[]),
    )
  })
}
