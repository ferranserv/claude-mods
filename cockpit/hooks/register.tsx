import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, Cache, EnhancerState, Fill, Limit, Notice, Saved } from '../types'
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
  bandWidth,
  cacheView,
  CELL,
  LANE_H,
  dotsSvg,
  clockText,
  C,
  bandParts,
  learnWindow,
  line,
  model,
  money,
  priceOf,
  sideSvg,
  sideWidth,
  bubbleArt,
  PILL_GAP,
  pillGroupSvg,
  undoSvg,
  wandSvg,
  windowMinutes,
} from './lib'
import type { ActionId, Alert, Model, Thresholds } from './lib'
import { COFFEE_AFTER_MS, FLEET_MS, LOOP_EXIT_MS, HOLD_MS, RUN_AFTER_MS, START_MS, TOOL_LINGER_MS, bubbleFor, clockOf, hoverHint, isAlert, nextShift, pickState, rank } from './mood'
import type { Bubble, Fleet, MoodInput, ToolKind } from './mood'
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
import { CONTEXT_LIMIT, HAIKU_ID, dayKey, labelLocally, realSaving } from './saver-logic'
import type { Level } from './saver-logic'
import { logPath, turnRow, withRow } from './turnlog'
import { STATES, STATE_IDS, enterMarkup, loopFrame, moveMs, stateMarkup } from './states'
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
const saverSaved = atom({ plugin: 'cockpit', key: 'saverSaved' } as const, { day: '', usd: 0 } as Saved)
const lastRouted = atom({ plugin: 'cockpit', key: 'lastRouted' } as const, false)
const preflightOn = atom({ plugin: 'cockpit', key: 'preflightOn' } as const, true)
const advice = atom({ plugin: 'cockpit', key: 'advice' } as const, [] as Advice[])
const isDismissed = atom({ plugin: 'cockpit', key: 'isDismissed' } as const, false)
const pending = atom({ plugin: 'cockpit', key: 'pending' } as const, null as string | null)
const notice = atom({ plugin: 'cockpit', key: 'notice' } as const, null as Notice | null)
const stateAtom = atom({ plugin: 'cockpit', key: 'enhancer' } as const, { hasDraft: false, isBusy: false, original: '' } as EnhancerState)
// Whether the "…" menu under the bubble is open.
const menuState = atom({ plugin: 'cockpit', key: 'menu' } as const, false)

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
  bg: 0, // background tasks (a command or an agent that runs on after the turn): counted when they start, one less at each task notification
  bgCheck: 0, // when the next look at the agents is booked
  bgSince: 0, // when the count went above zero (a task that never reports does not keep him fishing for ever)
  runCall: '', // a shell command that started and has not shown `running` yet (it does once it has run RUN_AFTER_MS)
  inputJson: '', // the first pieces of the arguments being streamed, to find the file's name
  failNote: '',
  shipNote: '', // what shipped: Committed, Pushed, Pull request opened...
  walkUntil: 0,
  helloUntil: 0,
  isFirstPrompt: true,
  busySince: 0,
  hasTool: false,
  dialog: false, // the dialog of a question from Claude is open: the band is drawn over it, not above the prompt
  offline: false, // a connector failed to connect and is still down
  coinsDue: false, // the saver routed during this turn: the coins play after the bell, not over the work
  shiftAt: 0, // when the next timed change of pose (coffee, the next alert) is already booked
  demo: null as { id: StateId; until: number; single: boolean } | null, // single: the only state of the demo; one with a button then stays until you answer it
  demoRun: 0,
  writing: false, // a handoff brief or an enhanced draft is being written
  sticky: null as { bubble: Bubble; state: StateId } | null, // a bubble that asks for a decision stays until you click its button or send something else
  dismissed: [] as string[], // warnings whose bubble you answered; quiet until the warning ends and comes back
  shownAlert: null as string | null, // the warning the bubble on screen stands for
  bubbleOff: false, // a click on Clawd hid the bubble; the next click brings it back, and a new pose clears it
  seenState: null as string | null, // the pose the last snapshot drew (a new one clears bubbleOff)
  settleAt: 0, // when the pose being drawn will have settled, the moment a redraw is already booked for
  resetAt: 0, // the next limit reset a redraw is already booked for
  draftTurn: false, // the turn is a /handoff: Claude writes the brief as text, with no tool to show it
  askAt: 0, // when a permission ask was seen; it only counts if nothing has moved on a moment later
  bub: null as { text: string; room: number; seq: number; art: ReturnType<typeof bubbleArt> | null; until: number } | null, // the bubble's drawing (see bubbleLane)
  msg: null as { text: string; until: number } | null, // a message to you (the one channel: the bubble), over everything but the raised hand
  history: [] as string[], // the last things the bubble said, for /cockpit log
  lastLogged: '', // the text last added to the history
  askId: '', // the call that ask is for: only that call starting running again, or ending, settles it
  drawn: null as { id: StateId; since: number; loopAt: number } | null, // what is on screen, since when, and when its loop began (after the move into it)
  move: null as { from: StateId; to: StateId; phase?: number } | null, // the state he left, so the drawing can play the move into the one he is in
}
/** A permission ask must stay open this long before Clawd raises a hand: a rule or the mode often settles it first. Set by the askSeconds option. */
let askMs = 5000

/** Clawd's drawing: the move from the state he left and the state's own loop, in one drawing (see enterMarkup). */
function mascotFor(state: StateId, clock: string, move: { from: StateId; to: StateId; phase?: number } | null, scale: 1 | 2) {
  if (move && move.to === state) {
    try {
      return enterMarkup(move.from, move.to, clock, scale, move.phase ?? 0)
    } catch {
      // A move that cannot be drawn falls back to the state itself.
    }
  }
  return stateMarkup(state, clock, scale)
}

/** How many agents (subagents, background or not) have a loop running or waiting: they keep going after the turn that started them. */
async function agentsRunning($: EngineInterface): Promise<number> {
  try {
    return (await $.agent.list()).filter(a => a.teammateId === undefined && (a.status === 'running' || a.status === 'waiting')).length
  } catch {
    return 0
  }
}

/** A background task is still running, as far as the count says (it gives up after BG_MAX_MS). */
function backgroundWaiting(now: number): boolean {
  if (mood.bg <= 0) {
    mood.bgSince = 0
    return false
  }
  if (mood.bgSince === 0) mood.bgSince = now
  if (now - mood.bgSince > BG_MAX_MS) {
    mood.bg = 0
    mood.bgSince = 0
    return false
  }
  return true
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
  if (id === 'coins' && (await read($, isBusy))) {
    mood.coinsDue = true
    return
  }
  const exit = LOOP_EXIT_MS[id]
  const ms = exit !== undefined ? (mood.drawn ? moveMs(mood.drawn.id, id) : 0) + exit : FLEET_MS[id]
  mood.fleet[id] = (await $.clock.now()) + ms
  poke($, ms)
}

type ToolInput = { tool?: string; tool_use_id?: string; file_path?: string; notebook_path?: string; pattern?: string; command?: string; run_in_background?: boolean }
/** A command asked to run in the background: counted until a task notification (or a kill) says it is over. Agents are not counted: `$.agent.list()` says which ones run. */
const startsBackground = (tool: string, i: ToolInput): boolean => (tool === 'Bash' || tool === 'PowerShell') && i.run_in_background === true
/** The calls that end one. */
const KILLS_BACKGROUND = ['KillShell', 'KillBash', 'TaskStop']
/** A background task that has not reported in this long is not waited for any more. */
const BG_MAX_MS = 4 * 60 * 60_000
/** Claude checking its own work: tests, linters, type checks, builds, validators. A pass shows the lab, a failure the blast. */
const VERIFY_COMMAND = new RegExp(
  '\\b(' +
    [
      'pytest|py\\.test|vitest|jest|mocha|rspec|phpunit|ctest|tox|nox|unittest|node --test|bun test|yarn test',
      '(npm|pnpm|yarn|bun)( run)? (test|lint|check|typecheck|type-check|build|validate|verify|ci)',
      'go (test|vet|build)|cargo (test|check|clippy|build)|dotnet (test|build)|deno (test|lint|check)',
      'make (test|check|lint|verify)|mvn( \\S+)* (test|verify)|gradlew? (\\S+ )*(test|check|build)',
      'plugin (test|validate)|tsc|eslint|ruff|mypy|pyright|flake8|pylint|rubocop|shellcheck|phpstan|golangci-lint',
      'black --check|prettier --check|biome (check|lint|ci)|playwright test|cypress run|pre-commit run|terraform validate|helm lint',
      'bash -n|python3? -m (py_compile|pytest|unittest|compileall)',
    ].join('|') +
    ')\\b',
  'i',
)
/** Something leaving for the world: a commit, a push, a pull request, a release. The text is what he says. */
const SHIP_COMMANDS: [RegExp, string][] = [
  [/\bgh\s+pr\s+merge\b/i, 'Merged'],
  [/\bgh\s+pr\s+create\b/i, 'Pull request opened'],
  [/\b(gh\s+release\s+create|npm\s+publish|cargo\s+publish|twine\s+upload)\b/i, 'Released'],
  [/\bgit\b[^|;&\n]*\bpush\b/i, 'Pushed'],
  [/\bgit\b[^|;&\n]*\bcommit\b/i, 'Committed'],
  [/\bgit\b[^|;&\n]*\b(merge|tag)\b/i, 'Merged'],
]
const SHIP_TOOLS: Record<string, string> = {
  mcp__github__create_pull_request: 'Pull request opened',
  mcp__github__merge_pull_request: 'Merged',
  mcp__github__push_files: 'Pushed',
  mcp__github__create_or_update_file: 'Pushed',
}
function shipOf(tool: string, command: string): string | null {
  if (SHIP_TOOLS[tool]) return SHIP_TOOLS[tool]!
  if (tool !== 'Bash' && tool !== 'PowerShell') return null
  for (const [re, text] of SHIP_COMMANDS) if (re.test(command)) return text
  return null
}
/** Commands that take a while by nature: they show `running` the moment they start. Everything else shows it after RUN_AFTER_MS. */
const SLOW_COMMAND = /\b((npm|pnpm|yarn|bun)( run)? (install|i|add|ci|build|dev|start)|pip3? install|cargo (install|run)|go (run|install)|apt(-get)? (install|update|upgrade)|brew (install|upgrade)|docker( compose)? (build|run|up|pull)|terraform (apply|plan|init)|make|sleep)\b/i
const isShell = (tool: string) => tool === 'Bash' || tool === 'PowerShell'
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
  if (startsBackground(tool, input)) mood.bg++
  const kind = toolKind(tool)
  if (kind) {
    mood.tool = { kind, until: Number.MAX_SAFE_INTEGER }
    mood.toolNote = baseName(String(input.file_path ?? input.notebook_path ?? input.pattern ?? ''))
  } else if (isShell(tool)) {
    // A check, an install or a build is a run from the start; any other command only once it has run a while (a quick one stays typing).
    const command = String(input.command ?? '')
    if (VERIFY_COMMAND.test(command) || SLOW_COMMAND.test(command)) {
      mood.tool = { kind: 'running', until: Number.MAX_SAFE_INTEGER }
      mood.toolNote = ''
    } else {
      const id = String(input.tool_use_id ?? tool)
      mood.runCall = id
      $.clock.after(RUN_AFTER_MS, () => {
        // Still the same call, and no other tool is showing (a Read beside it is the more specific pose).
        if (mood.runCall !== id || (mood.tool && mood.tool.until === Number.MAX_SAFE_INTEGER)) return
        mood.tool = { kind: 'running', until: Number.MAX_SAFE_INTEGER }
        mood.toolNote = ''
        poke($)
      })
    }
  }
  poke($)
}

/** Writing a file or an edit is something the model streams for a while before the tool runs: Clawd paints it. */
const CREATES = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

/** One piece of the model's stream: a tool call beginning, or a piece of its arguments (the file's name is in the first). */
function noteChunk($: EngineInterface, c: { kind: string; name?: string; json?: string }): void {
  if (c.kind === 'tool' && CREATES.includes(String(c.name))) {
    mood.tool = { kind: 'creating', until: Number.MAX_SAFE_INTEGER }
    mood.toolNote = ''
    mood.inputJson = ''
    poke($)
  } else if (c.kind === 'input' && mood.tool?.kind === 'creating' && mood.toolNote === '') {
    mood.inputJson = (mood.inputJson + String(c.json ?? '')).slice(0, 600)
    const name = /"(?:file_path|notebook_path)"\s*:\s*"([^"]+)"/.exec(mood.inputJson)
    if (name?.[1]) {
      mood.toolNote = baseName(name[1])
      poke($)
    }
  }
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
    mood.dialog = false
  }
  if (tool === 'AskUserQuestion' && mood.dialog) {
    mood.dialog = false
    poke($)
  }
  if (mood.runCall === String(input.tool_use_id ?? tool)) mood.runCall = ''
  if (mood.tool) {
    mood.tool = { kind: mood.tool.kind, until: now + TOOL_LINGER_MS }
    poke($, TOOL_LINGER_MS)
  }
  if (startsBackground(tool, input) && r?.isError) mood.bg = Math.max(0, mood.bg - 1) // it never started
  if (KILLS_BACKGROUND.includes(tool) && !r?.isError) mood.bg = Math.max(0, mood.bg - 1)
  const command = String(input.command ?? '')
  const isCheck = (tool === 'Bash' || tool === 'PowerShell') && VERIFY_COMMAND.test(command)
  if (r?.isError) {
    if (isCheck) await flash($, 'boom')
    else {
      mood.failNote = tool
      await flash($, 'oops')
    }
  } else if (tool === 'ExitPlanMode') await flash($, 'idea')
  else {
    const shipped = shipOf(tool, command)
    if (shipped) {
      mood.shipNote = shipped
      await flash($, 'ship')
    } else if (isCheck) await flash($, 'lab')
  }
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
    await $.command.run({ command: 'compact' })
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

/** What a button in the bubble or its menu can do. */
type ActId = ActionId | 'worktree' | 'checkpoint' | 'askCommit' | 'noCommit' | 'commitPeer' | 'hide' | 'switch' | 'copyPath' | 'copyUndo' | 'ok'
type ActRef = { id: ActId; label: string; arg?: string | boolean }
/** What Clawd says: the words, the warning it stands for, and its buttons: the first is the bubble's own, the rest are in its menu. */
type Speech = { text: string; alertId?: string; acts: ActRef[] }

type Snap = {
  m: Model
  now: number
  isWorking: boolean
  enh: EnhancerState
  state: StateId
  speech: Speech | null
  hover: Speech | null
  menuOpen: boolean
  clock: string
  mascot: { markup: string; width: number; height: number }
}

/** What each answer to a warning is called. */
const ACTION_LABELS: Record<ActionId, string> = { handoff: 'Handoff', copy: 'Copy handoff', fresh: 'Fresh', saverOn: 'Saver on', compact: 'Compact' }

const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`

/** One preflight finding as words and its one action (none for a session still working). */
function adviceAct(a: Advice, ask: string | null): { text: string; act: ActRef | null } {
  if (a.kind === 'main' || a.kind === 'shared-folder') return { text: label(a), act: { id: 'worktree', label: 'New worktree' } }
  if (a.kind === 'dirty') return { text: label(a), act: { id: 'checkpoint', arg: a.onDefault, label: a.onDefault ? 'Commit to new branch' : 'Commit checkpoint' } }
  if (a.kind === 'peer-done' && a.take > 0) {
    if (ask === a.peerId) return { text: `Commit ${files(a.take)} on ${a.branch}? Not pushed.`, act: { id: 'commitPeer', arg: a.peerId, label: 'Yes, commit' } }
    return { text: label(a), act: { id: 'askCommit', arg: a.peerId, label: 'Commit its files' } }
  }
  return { text: label(a), act: null }
}

/** A few words for a finding that sits in the menu behind the one the bubble shows. */
function adviceName(a: Advice): string {
  if (a.kind === 'main') return 'on main'
  if (a.kind === 'shared-folder') return 'shared folder'
  if (a.kind === 'dirty') return `${a.count} changed`
  return `session ${short(a.peerId)} ${a.kind === 'peer-done' ? 'done' : 'working'}`
}

/** The preflight findings as one bubble: the one to act on first, the others and Hide in the menu. */
function adviceSpeech(rows: Advice[], ask: string | null): Speech {
  const all = rows.map(a => ({ a, ...adviceAct(a, ask) }))
  const ordered = [...all.filter(x => x.act !== null), ...all.filter(x => x.act === null)]
  const head = ordered[0]
  const acts: ActRef[] = []
  if (head?.act) acts.push(head.act)
  if (head && ask !== null && head.act?.id === 'commitPeer') acts.push({ id: 'noCommit', label: 'No' })
  for (const x of ordered.slice(1)) if (x.act) acts.push({ ...x.act, label: `${x.act.label} (${adviceName(x.a)})` })
  acts.push({ id: 'hide', label: 'Hide all' })
  const more = ordered.length > 1 ? ` (+${ordered.length - 1})` : ''
  return { text: `${head?.text ?? ''}${more}`, acts }
}

/** A notice as one bubble: the sentence, then OK (or Switch for a new worktree); path and undo command are in the menu. */
function noticeSpeech(n: Notice): Speech {
  const at = n.text.indexOf(' Undo: ')
  const undo = at >= 0 ? n.text.slice(at + 7).trim() : ''
  let text = (at >= 0 ? n.text.slice(0, at) : n.text).trim()
  if (text.length > 70) text = text.split(/(?<=\.)\s/)[0] ?? text
  const acts: ActRef[] = []
  if (n.text.startsWith('Worktree ready')) acts.push({ id: 'switch', label: 'Switch' }, { id: 'copyPath', label: 'Copy path' }, { id: 'ok', label: 'OK' })
  else acts.push({ id: 'ok', label: 'OK' })
  if (undo !== '') acts.push({ id: 'copyUndo', arg: undo, label: 'Copy undo command' })
  return { text: `${n.isError ? '! ' : ''}${text}`, acts }
}

/** Reads every feature's state once and decides what Clawd does and says. */
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
  const isWorking = propsWorking || (await read($, isBusy))
  const today = new Date(now)
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const saved = await read($, saverSaved)
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
  const moodInput: MoodInput = {
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
    offline: mood.offline,
    bg: backgroundWaiting(now) || (!isWorking && (await agentsRunning($)) > 0),
  }
  // While something runs in the background, look again every so often (an agent that ends leaves no event of its own).
  if (moodInput.bg && now >= mood.bgCheck) {
    mood.bgCheck = now + 15_000
    $.clock.after(15_000 + 60, () => $.ui.invalidate('ui.render'))
  }
  const picked: StateId = mood.demo && mood.demo.until > now ? mood.demo.id : pickState(moodInput)
  // Coffee comes and goes while he works, and the status alerts take turns when he is done: book a redraw for the next change.
  const shift = nextShift(moodInput)
  if (shift !== null && now + shift !== mood.shiftAt) {
    mood.shiftAt = now + shift
    $.clock.after(shift + 60, () => $.ui.invalidate('ui.render'))
  }
  // A state stays on screen at least HOLD_MS, unless one that is more important comes along (a raised hand never waits).
  // While a bubble waits for a decision, an idle Clawd stays in the pose that goes with it (cold, on fire...), not back to idle.
  const wanted: StateId = !isDemo && mood.sticky && (picked === 'idle' || picked === 'talk') ? mood.sticky.state : picked
  const shown = mood.drawn
  // Painting a file and then hammering it (or reading, then browsing) is one piece of work: those follow each other at once.
  const isWork = (id: StateId) => id === 'creating' || id === 'building' || id === 'reading' || id === 'browse' || id === 'running'
  const state: StateId = !isDemo && shown && shown.id !== wanted && shown.id !== 'hand' && now - shown.since < HOLD_MS && rank(wanted) >= rank(shown.id) && !(isWorking && isAlert(shown.id)) && !(isWork(wanted) && isWork(shown.id)) ? shown.id : wanted
  if (!mood.drawn || mood.drawn.id !== state) {
    // A move out of typing or running begins on the frame of the loop he is on (see loopFrame), so nothing jumps when it starts.
    const phase = mood.drawn ? loopFrame(mood.drawn.id, now - mood.drawn.loopAt) : 0
    mood.move = mood.drawn ? { from: mood.drawn.id, to: state, phase } : null
    mood.drawn = { id: state, since: now, loopAt: now + (mood.move ? moveMs(mood.move.from, state, phase) : 0) }
    $.clock.after(HOLD_MS + 80, () => $.ui.invalidate('ui.render'))
  }
  // He moves from one pose to the next over a second or two (he puts down what he held and picks up the next thing): his
  // bubble waits until he has settled, so it never talks about what he is no longer, or not yet, doing.
  const settleAt = mood.drawn && mood.move && mood.move.to === state && !isDemo ? mood.drawn.since + moveMs(mood.move.from, mood.move.to, mood.move.phase) : 0
  const isSettled = settleAt <= now
  if (!isSettled && settleAt !== mood.settleAt) {
    mood.settleAt = settleAt
    $.clock.after(settleAt - now + 60, () => $.ui.invalidate('ui.render'))
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
    detail: state === 'oops' ? mood.failNote : state === 'ship' ? mood.shipNote : mood.toolNote,
    savedUsd: usd > 0 ? money(usd) : '',
    hasAdvice: rows.length > 0,
  })
  // A bubble that stands for a warning is only said while the warning stands (a pose held a few seconds after it ended says nothing).
  const bubble = said && said.alertId !== undefined && (mood.dismissed.includes(said.alertId) || (!isDemo && !alerts.some(a => a.id === said.alertId))) ? null : said

  // A bubble belongs to the pose on screen and goes with it (it is deleted letter by letter when the pose changes); one that
  // asks for a decision also keeps the pose until you click its button or send something else.
  let spoken: Bubble | null = bubble
  if (isDemo) {
    // A demo shows the state with its own bubble and takes both away together; it leaves nothing pending behind. One
    // state shown alone with a button waits for you to answer it, like the real one.
    if (mood.demo?.single && bubble?.action) mood.demo.until = HELD
  } else if (bubble?.action && state !== 'hand') mood.sticky = { bubble, state }
  // A message to you speaks over everything but the raised hand (it is the answer to something you just did).
  if (!isDemo && state !== 'hand' && mood.msg && mood.msg.until > now) spoken = { text: mood.msg.text }
  else if (!isSettled) spoken = null

  // The state's own bubble first; then, when Clawd is only on the case (a notice to read, findings to act on), those.
  const speechOf = (b: Bubble): Speech => {
    const alert = b.alertId !== undefined ? alerts.find(a => a.id === b.alertId) : undefined
    const ids: ActionId[] = b.action ? [b.action, ...(alert?.actions ?? []).filter(id => id !== b.action)] : []
    return { text: b.text, alertId: b.alertId, acts: ids.filter(id => !(isWorking && id !== 'saverOn')).map(id => ({ id, label: ACTION_LABELS[id] })) }
  }
  const standing = async (): Promise<Speech | null> => {
    if (state === 'talk' && note) return noticeSpeech(note)
    if (state === 'detective' && rows.length > 0 && !isWorking) return adviceSpeech(rows, await read($, pending))
    return null
  }
  if (mood.seenState !== state) {
    mood.seenState = state
    mood.bubbleOff = false
  }
  let speech: Speech | null = spoken ? speechOf(spoken) : null
  if (!speech && !isDemo && isSettled) speech = await standing()
  // Hidden by a click on Clawd: nothing is said, and the words wait for the next click (as the hover text).
  if (mood.bubbleOff) speech = null
  // What his pose is about, for when the bubble is gone: hovering over him says it again (only while the pointer is there).
  const aboutBubble = said && (said.alertId === undefined || isDemo || alerts.some(a => a.id === said.alertId)) ? said : null
  const hint = hoverHint(state)
  const hover: Speech | null = speech || !isSettled ? null : aboutBubble ? speechOf(aboutBubble) : isDemo ? null : (await standing()) ?? (hint ? { text: hint, acts: [] } : null)
  if (!isDemo && speech && speech.text !== mood.lastLogged) remember(now, speech.text)
  mood.shownAlert = isDemo ? null : (speech?.alertId ?? null)
  // The menu belongs to the bubble it opened from: when there is none, it closes.
  const menuOpen = await read($, menuState)
  if (menuOpen && (!speech || speech.acts.length < 2)) $.clock.after(0, () => void update($, menuState, () => false))
  return {
    m,
    now,
    isWorking,
    enh: await read($, stateAtom),
    state,
    speech,
    hover,
    menuOpen: menuOpen && speech !== null && speech.acts.length > 1,
    clock,
    mascot: mascotMode === 'off' ? { markup: '', width: 0, height: 0 } : mascotFor(state, clock, mood.move, mascotMode === 'small' ? 1 : 2),
  }
}

type Comps = { Box: never; Text: never; Button: never; Svg?: never; Client?: never }
const el = (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => h(type as never, props as never, ...(children as never[])) as never

const NBSP = ' '

/**
 * A button in the cockpit gray with dark text, the same as the speech bubble, whatever the app's own button style is.
 * It is a real button whose label carries the color (no drawing with a click area laid over it), so what you see is
 * what you click on every surface. A leading symbol of the label is dropped: it says what it does.
 */
function pill(c: Comps, label: string, props: Record<string, unknown>, fill: { color: string; backgroundColor: string } = { color: '#1b1a19', backgroundColor: C.gray }) {
  const text = label.replace(/^[^\p{L}\p{N}]+/u, '')
  return el(c.Button, { plain: true, ...props }, el(c.Text, fill, `${NBSP}${text}${NBSP}`))
}

/** Pressing a button, or sending something else, is the decision a bubble was waiting for. */
function dismissBubble(): void {
  if (mood.demo?.until === HELD) {
    mood.demoRun++
    mood.demo = null
  }
  if (mood.shownAlert && !mood.dismissed.includes(mood.shownAlert)) mood.dismissed.push(mood.shownAlert)
  mood.sticky = null
  mood.msg = null
}

/**
 * The cockpit's band as one tree, for the places that draw it: above the prompt, and over the dialog of a question from
 * Claude. `compact` leaves out the speech rows (a dialog has a small row budget).
 */
async function bandTree($: EngineInterface, e: { surface: string }, o: { isWorking: boolean; bodyColumns: number; compact: boolean; plain?: boolean }): Promise<never> {
    let s: Snap
    try {
      s = await snapshot($, o.isWorking)
    } catch (err) {
      // A drawing that cannot be built must not blank the band without a word: say what failed.
      const { Box: B, Text: T } = $.ui.resolve(e as never)
      const c0 = { Box: B, Text: T } as unknown as Comps
      return el(c0.Box, { key: bandKey('cockpit') }, el(c0.Text, { color: '#e2553f' }, `Cockpit could not draw: ${err instanceof Error ? err.message : String(err)}`)) as never
    }
    const { Box, Text, Button } = $.ui.resolve(e as never)
    const Draw = ($.ui.resolve(e as never) as { Svg?: unknown }).Svg
    const c = { Box, Text, Button, Client: ($.ui.resolve(e as never) as { Client?: unknown }).Client, Svg: e.surface === 'terminal' ? undefined : Draw } as unknown as Comps
    const fx = makeFx($)

    let row
    let speech: unknown[] = []
    if (e.surface === 'terminal') {
      const meters = el(c.Box, { key: 'meters' }, ...(mascotMode === 'off' ? [] : [el(c.Text, { key: 'face', dimColor: true }, `${STATES[s.state].face}  `)]), ...line(s.m).map((seg, i) => el(c.Text, { key: `s${i}`, color: seg.fill }, seg.t)))
      // In the question's dialog the budget is 12 rows counted at 40 columns: one Text row, cut at the edge.
      const one = el(c.Text, { key: 'plain', wrap: 'truncate-end' }, `${mascotMode === 'off' ? '' : `${STATES[s.state].face}  `}${line(s.m).map(seg => seg.t).join('')}`)
      row = o.plain ? one : el(c.Box, { key: 'row', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, meters, controls(s, c, fx))
      speech = o.compact ? [] : speechText(s, c, fx, e.surface)
    } else {
      const Svg = ($.ui.resolve(e as never) as { Svg: unknown }).Svg
      const width = Math.max(300, bandWidth(o.bodyColumns) - 90)
      // Clawd and the meters are two drawings: a new pose replaces only Clawd's, so the meters never reload (a replaced
      // drawing blinks) and change only when a number does.
      const parts = bandParts(width, s.m, s.mascot)
      if (o.plain) {
        // The dialog of a question takes no size and no place (no overlay, no fixed width): both drawings at their own size, in a row.
        return el(c.Box, { key: bandKey('cockpit'), flexDirection: 'row', alignItems: 'center' },
          ...(parts.mascot ? [el(Svg, { key: 'mascot', source: parts.mascot.source, alt: STATES[s.state].label, isInteractive: true })] : []),
          el(Svg, { key: 'meters', source: parts.meters.source, alt: altText(s.m) })) as never
      }
      const lane = bubbleLane($, s, c, Svg, fx, parts.meters.width, e.surface)
      const column = el(c.Box, { key: 'col', flexDirection: 'column', paddingLeft: parts.mascot ? 3 : 0 }, el(Svg, { key: 'meters', source: parts.meters.source, alt: altText(s.m), width: parts.meters.width, height: parts.meters.height }), ...lane)
      const drawn = el(
        c.Box,
        { key: 'art', flexDirection: 'row', alignItems: 'center' },
        ...(parts.mascot ? [clawdColumn(c, s, parts, fx)] : []),
        column,
      )
      row = el(c.Box, { key: 'row', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, drawn, controls(s, c, fx, Svg))
    }

    return el(c.Box, { key: bandKey('cockpit'), flexDirection: 'column' }, row, ...(speech as never[])) as never
}

/**
 * Clicking Clawd says again what his pose is about: a warning you had answered comes back (and stays until you answer it
 * again); anything else is said for a few seconds. There is no hover to count on in the app, so he is a button.
 */
async function recallNow($: EngineInterface, text: string, alertId?: string): Promise<void> {
  if (alertId !== undefined) {
    mood.dismissed = mood.dismissed.filter(id => id !== alertId)
    mood.msg = null
    poke($)
  } else if (text !== '') await tell($, text)
}

/** A click on Clawd: hides the bubble on screen, or (when none is) shows the words he would say and their warning, if any. */
async function toggleBubble($: EngineInterface, visible: boolean, text: string, alertId?: string): Promise<void> {
  if (visible) {
    mood.bubbleOff = true
    dismissBubble()
  } else {
    mood.bubbleOff = false
    await recallNow($, text, alertId)
  }
  $.ui.invalidate('ui.render')
}

/** What pressing a button does. */
function runAct(a: ActRef, fx: Fx, surface: string): void {
  if (a.id === 'handoff') fx.handoff('full')
  else if (a.id === 'copy') fx.handoff('brief')
  else if (a.id === 'fresh') fx.fresh()
  else if (a.id === 'compact') fx.compact()
  else if (a.id === 'saverOn') fx.saver(true)
  else if (a.id === 'worktree') fx.newWorktree()
  else if (a.id === 'checkpoint') fx.checkpoint(a.arg === true)
  else if (a.id === 'askCommit') fx.askCommit(String(a.arg))
  else if (a.id === 'noCommit') fx.askCommit(null)
  else if (a.id === 'commitPeer') fx.commitPeer(String(a.arg))
  else if (a.id === 'hide') fx.hideAdvice()
  else if (a.id === 'switch') fx.switchInto()
  else if (a.id === 'copyPath') fx.copyWorktree(surface)
  else if (a.id === 'copyUndo') fx.copyText(String(a.arg), surface)
  else fx.dismissNotice()
}

type BtnSpec = { key: string; label: string; press: () => void }

/**
 * A group of buttons: one row of pills, each a press target (`pressTarget`): its drawing is its whole click area, so nothing is
 * laid over it. With no drawing surface (the terminal), plain text buttons in a row.
 */
function buttonGroup(c: Comps, specs: BtnSpec[], key = 'btns') {
  if (specs.length === 0) return []
  if (!c.Svg) return [el(c.Box, { key, flexDirection: 'row', alignItems: 'center', gap: 1 }, ...specs.map(b => pill(c, b.label, { key: b.key, onPress: b.press })))]
  // Each pill is its own press target (its drawing is its click area), with the gap between them drawn as blank space.
  const row: unknown[] = []
  specs.forEach((b, i) => {
    const art = pillGroupSvg([b.label])
    if (i > 0) row.push(el(c.Svg as never, { key: `gap-${i}`, source: `<svg xmlns="http://www.w3.org/2000/svg" width="${PILL_GAP}" height="${art.height}"/>`, alt: '', width: PILL_GAP, height: art.height }))
    row.push(pressTarget(c, `press-${b.key}`, { source: art.source, alt: b.label, width: art.width, height: art.height, isInteractive: false }, b.press))
  })
  return [el(c.Box, { key, flexDirection: 'row', alignItems: 'center', flexShrink: 0 }, ...row)]
}

/**
 * Clawd and, under him, three small dots that show or hide his bubble. His drawing is an interactive Svg (a sandboxed frame, so
 * it animates) and the frame keeps the pointer for itself, so the Client laid over him is not reached on the desktop; the dots are
 * a plain drawing with a Client over it, like the pills. They take only the height the row has to spare (the meters and the lane
 * are taller than he is), so the band never grows.
 */
function clawdColumn(c: Comps, s: Snap, parts: { mascot: { source: string; width: number; height: number } | null; meters: { height: number } }, fx: Fx) {
  const m = parts.mascot!
  const toggle = () => fx.toggle(s.speech !== null, s.hover?.text ?? '', s.hover?.alertId)
  const room = Math.min(14, parts.meters.height + LANE_H - m.height)
  const dots = room >= 8 ? dotsSvg(m.width, room) : null
  return el(
    c.Box,
    { key: 'clawd-col', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
    pressTarget(c, 'clawd', { source: m.source, alt: STATES[s.state].label, width: m.width, height: m.height, isInteractive: true, svgKey: 'mascot' }, toggle),
    ...(dots ? [pressTarget(c, 'clawd-dots', { source: dots.source, alt: 'Show or hide what Clawd says', width: dots.width, height: dots.height, isInteractive: false }, toggle)] : []),
  )
}

/**
 * What a press does, by the key of the Client (press.tsx) that was pressed. A Client's region is exactly its drawing, so the
 * whole drawing is the click area: no Button is laid over it (a desktop Button is one line, as wide as its label).
 */
const presses = new Map<string, () => void>()

/** A press target: a Client whose drawing is its region; a pointer release on it runs `press` (the `ui.message` hook below). */
function pressTarget(c: Comps, key: string, art: { source: string; alt: string; width: number; height: number; isInteractive: boolean; svgKey?: string }, press: () => void) {
  const clientKey = `${key}-press`
  presses.set(clientKey, press)
  // The engine reads the Client and its module off this source before anything runs: it is called here with its module a string literal.
  // A Client's module cannot draw an Svg (its table has none), so the drawing stays out here and the Client, an empty region, is laid
  // over it at 100% of the drawing's own box: the region is the drawing's size whatever the host's cells are.
  const Client = c.Client as (props: Record<string, unknown>) => never
  return el(
    c.Box,
    { key, position: 'relative', flexShrink: 0 },
    el(c.Svg as never, { key: art.svgKey ?? `${key}-art`, source: art.source, alt: art.alt, isInteractive: art.isInteractive, width: art.width, height: art.height }),
    el(c.Box, { key: `${key}-hit`, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }, Client({ key: clientKey, module: './press.tsx', width: '100%', height: '100%' })),
  )
}

/** What one action's button does: pressing it answers the bubble and closes the menu. */
function actSpec(a: ActRef, fx: Fx, surface: string): BtnSpec {
  const key = a.id === 'saverOn' ? 'saver' : a.arg !== undefined && typeof a.arg === 'string' ? `${a.id}-${a.arg}` : a.id
  return {
    key,
    label: a.label,
    press: () => {
      dismissBubble()
      fx.menu(false)
      runAct(a, fx, surface)
    },
  }
}

/** The buttons of a bubble: its own action, then the "…" that opens the others. */
function bubbleSpecs(s: Snap, fx: Fx, surface: string): BtnSpec[] {
  const acts = s.speech?.acts ?? []
  const first = acts[0]
  return [...(first ? [actSpec(first, fx, surface)] : []), ...(acts.length > 1 ? [{ key: 'more', label: '…', press: () => fx.menu(!s.menuOpen) }] : [])]
}

/** The bubble's other buttons, in a row under it, while the menu is open. */
function menuRow(s: Snap, c: Comps, fx: Fx, surface: string, indent: number) {
  if (!s.menuOpen || !s.speech) return []
  return [el(c.Box, { key: 'menu', flexDirection: 'row', alignItems: 'center', paddingLeft: indent }, ...buttonGroup(c, s.speech.acts.slice(1).map(a => actSpec(a, fx, surface)), 'menu-btns'))]
}

/** On the terminal and in the side panel the bubble is a line of text with its buttons (the desktop band draws pixels). */
function speechText(s: Snap, c: Comps, fx: Fx, surface: string) {
  if (!s.speech) return []
  const items: unknown[] = [el(c.Text, { key: 't' }, s.speech.text), ...buttonGroup(c, bubbleSpecs(s, fx, surface))]
  return [el(c.Box, { key: 'bubble', flexDirection: 'row', alignItems: 'center', gap: 1, flexWrap: 'wrap', paddingLeft: 3 }, ...items), ...menuRow(s, c, fx, surface, 3)]
}

/** The wand as a text glyph with the text-presentation selector (U+FE0E), drawn white: a font outline, not the colour emoji. A Button takes only strings and Text, never an Svg. */
const WAND = '\u{1FA84}︎'

/** The small controls at the right of the row: enhance and undo. */
function controls(s: Snap, c: Comps, fx: Fx, Svg: unknown = null) {
  const tip = (text: string) => el(c.Box, { position: 'absolute', top: -1, right: 0, display: 'none', hover: { display: 'flex' } }, el(c.Text, { dimColor: true }, text))
  const items: unknown[] = []
  // While Enhance runs nothing changes but the color: the wand button turns green, and is gray again when it is done.
  if (s.enh.original !== '') {
    const undo = undoSvg()
    items.push(el(c.Box, { key: 'undo-wrap', position: Svg ? 'relative' : undefined }, Svg ? pressTarget(c, 'press-undo', { source: undo.source, alt: 'Restore my draft', width: undo.width, height: undo.height, isInteractive: false }, () => fx.undoEnhance()) : el(c.Button, { key: 'undo', plain: true, dimColor: true, onPress: () => fx.undoEnhance() }, '↩'), tip('Restore my draft')))
  }
  const tipText = s.enh.isBusy ? 'Enhancing…' : `Enhance${enhanceLabel ? ` (${enhanceLabel})` : ''}`
  if (Svg) {
    // The wand is a press target like the pills: its drawing (a rounded square with the wand in it) is the whole click area.
    const wand = wandSvg(!s.enh.hasDraft, s.enh.isBusy)
    items.push(el(c.Box, { key: 'enhance-wrap', position: 'relative' }, pressTarget(c, 'press-wand', { source: wand.source, alt: s.enh.isBusy ? 'Enhancing my draft' : 'Enhance my draft', width: wand.width, height: wand.height, isInteractive: false }, () => fx.enhance()), tip(tipText)))
  } else items.push(el(c.Box, { key: 'enhance-wrap' }, el(c.Button, { key: 'enhance', dimColor: !s.enh.hasDraft && !s.enh.isBusy, onPress: () => fx.enhance() }, el(c.Text, { color: s.enh.isBusy ? 'green' : 'white' }, WAND)), tip(tipText)))
  return el(c.Box, { key: 'controls', flexDirection: 'row', alignItems: 'center', gap: 2, paddingX: 1 }, ...items)
}



/**
 * The bubble's lane: one row, always there, under the meters and beside Clawd, so the cockpit never grows or shrinks when
 * he speaks. The bubble is drawn at the left (its tail toward him), its buttons at the right, in the same row height.
 * Each change of words is a new drawing laid over the old one for a moment (kept mounted, so nothing reloads or blinks
 * under it), then the old one is dropped; a closed bubble leaves no drawing behind.
 */
function bubbleLane($: EngineInterface, s: Snap, c: Comps, Svg: unknown, fx: Fx, metersPx: number, surface: string): unknown[] {
  const specs = s.speech ? bubbleSpecs(s, fx, surface) : []
  // The bubble gets all the row up to its buttons (and no more than its words need); with no buttons, all of it.
  const gap = CELL.w
  const buttonsPx = specs.length > 0 ? pillGroupSvg(specs.map(b => b.label)).width : 0
  const room = Math.max(120, metersPx - (buttonsPx > 0 ? buttonsPx + gap : 0))
  const text = s.speech?.text ?? ''
  // ONE drawing at a time, never two bubbles: when the words change, the drawing that replaces it starts as the old bubble,
  // deletes its words (the bubble shortens with them), then types the new ones (it lengthens with them). A closed bubble
  // leaves nothing drawn.
  let bub = mood.bub
  const change = (): void => {
    // The words changed (and with them, often, the buttons beside the bubble and so the room it has): one drawing from the old words
    // to the new, in the room it has now. This also opens a bubble that arrives with buttons and closes one that leaves with them.
    const art = bubbleArt(bub!.text, text, room)
    const ms = Math.ceil(art.seconds * 1000)
    bub!.seq++
    bub!.art = art
    bub!.room = room
    bub!.until = s.now + ms + 100
    bub!.text = text
    $.clock.after(ms + 150, () => $.ui.invalidate('ui.render'))
  }
  if (!bub) bub = mood.bub = { text, room, seq: 1, art: text === '' ? null : bubbleArt(text, text, room), until: 0 }
  else if (text !== bub.text) change()
  else if (bub.room !== room) {
    // Only the room changed (a resized window, other buttons): the same words, drawn again, still, for the room they have.
    bub.seq++
    bub.room = room
    bub.art = text === '' ? null : bubbleArt(text, text, room)
  }
  if (bub.art && bub.text === '' && bub.until <= s.now) bub.art = null
  const buttons = buttonGroup(c, specs)
  // The lane is made of drawings in px and the buttons sit at the right edge of the meters' width through a growing spacer:
  // nothing is counted in the host's character cells, so nothing drifts.
  const zone = el(
    c.Box,
    { key: 'zone', position: 'relative', flexShrink: 0 },
    // A blank drawing that holds the lane's height and the bubble's width (the bubble drawings are laid over it).
    el(Svg, { key: 'space', source: `<svg xmlns="http://www.w3.org/2000/svg" width="${room}" height="${LANE_H}"/>`, alt: 'bubble space', width: room, height: LANE_H }),
    ...(bub.art ? [el(c.Box, { key: `b${bub.seq}`, position: 'absolute', top: 0, left: 0 }, el(Svg, { key: 'art', source: bub.art.source, alt: text, isInteractive: true, width: bub.art.width, height: bub.art.height }))] : []),
  )
  return [
    el(c.Box, { key: 'lane', flexDirection: 'row', alignItems: 'center' }, zone, el(c.Box, { key: 'grow', flexGrow: 1 }), ...buttons),
    ...menuRow(s, c, fx, surface, 0),
  ]
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
  copyText: (text: string, surface: string) => void
  checkpoint: (onDefault: boolean) => void
  askCommit: (peerId: string | null) => void
  commitPeer: (peerId: string) => void
  hideAdvice: () => void
  dismissNotice: () => void
  menu: (open: boolean) => void
  toggle: (visible: boolean, text: string, alertId?: string) => void
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
    copyText: (text, surface) => void $.ui.copy({ text, surface: surface as never }),
    checkpoint: onDefault => then(() => checkpoint($, onDefault))(),
    askCommit: peerId => void update($, pending, () => peerId),
    commitPeer: peerId => then(() => commitPeer($, peerId))(),
    hideAdvice: () => void update($, isDismissed, () => true),
    dismissNotice: () => void update($, notice, () => null),
    menu: open => void update($, menuState, () => open),
    toggle: (visible, text, alertId) => void toggleBubble($, visible, text, alertId),
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
  await tryRegister($, { name: 'cockpit', description: 'The band above the prompt: /cockpit mascot, log or demo', argumentHint: 'mascot|log|demo' })
  const storedMascot = await $.store.get('mascot')
  if (storedMascot === 'normal' || storedMascot === 'small' || storedMascot === 'off') mascotMode = storedMascot
  mood.walkUntil = (await $.clock.now()) + START_MS
  // A session started (or opened again): what was drawn for another one is forgotten, so nothing stale is laid over what this one draws.
  mood.bub = null
  mood.drawn = null
  mood.move = null
  mood.bg = 0
  mood.bgSince = 0
  mood.msg = null
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
      mood.runCall = ''
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
      mood.dialog = false
      mood.tool = null
      mood.runCall = ''
      mood.compacting = false
      if (hasLog) await safe(() => logTurn($, e))
      if (hasSound && e.reason !== 'aborted') await chime($)
      if (e.reason !== 'aborted') await safe(() => flash($, 'bell'))
      else poke($)
      if (mood.coinsDue) {
        mood.coinsDue = false
        await safe(async () => {
          await flash($, 'coins')
          if (e.reason !== 'aborted') mood.fleet.coins = (mood.fleet.bell ?? 0) + FLEET_MS.coins // after the bell
          poke($, FLEET_MS.bell + FLEET_MS.coins)
        })
      }
    }
    await safe(() => beat($, 'idle'))
    void refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Sending a message restarts the cache countdown (the next request re-reads or re-writes the whole prefix)
  // and labels the turn for the saver; the enhancer's draft is spent. Commands and hidden prompts send nothing.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') mood.bg = Math.max(0, mood.bg - 1) // a background task reported
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
    mood.dialog = false
    if (mood.tool?.kind === 'creating') mood.tool = null // a new request: whatever was being written has run, or never will
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
    // The stream is passed on untouched; what the model begins to write (a tool call and its arguments) tells Clawd he is painting.
    const stream = next(isHaiku ? { ...e, model: HAIKU_ID } : e)
    let step = await stream.next()
    try {
      while (!step.done) {
        noteChunk($, step.value as { kind: string; name?: string; json?: string })
        yield step.value
        step = await stream.next()
      }
    } finally {
      if (!step.done) await stream.return?.(undefined as never)
    }
    const response = step.value
    const endedAt = await $.clock.now()

    await safe(async () => {
      await update($, lastRouted, () => isHaiku)
      if (isHaiku) await flash($, 'coins')
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
    // The prompt cache belongs to a model: after a switch the new model starts with none, whatever the countdown said.
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
    // The hand is for a question Claude put to you (AskUserQuestion, a plan to approve), not for permission prompts.
    if (r.decision === 'ask' && e.tool_use_id !== undefined && (e.tool === 'AskUserQuestion' || e.tool === 'ExitPlanMode')) {
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
    if (v && v.isConnected === false && v.reason === 'failed') {
      mood.offline = true
      await safe(() => flash($, 'plug'))
    } else if (v && v.isConnected === true) mood.offline = false
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
    const state = (await read($, saverOn)) ? 'on' : 'off'
    return { text: `saver is ${state}. When it routes a step to Haiku Clawd says so in the bubble. Use /saver on, /saver off or /saver why.` }
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
    if (arg === 'mascot' || arg.startsWith('mascot ')) {
      const wanted = arg.slice(6).trim()
      if (wanted !== 'on' && wanted !== 'normal' && wanted !== 'small' && wanted !== 'off') return { text: `Clawd is ${mascotMode === 'normal' ? 'full size' : mascotMode}. Use /cockpit mascot on, small or off.` }
      mascotMode = wanted === 'on' ? 'normal' : wanted
      await $.store.set('mascot', mascotMode)
      poke($)
      return { text: mascotMode === 'off' ? 'Clawd is hidden. The speech bubble and the meters stay. /cockpit mascot on brings him back.' : mascotMode === 'small' ? 'Clawd is small.' : 'Clawd is full size.' }
    }
    return { text: "The band is one row: the meters, always visible. Clawd's bubble carries every message and its buttons (a … opens the others). Use /cockpit mascot on, small or off, /cockpit log for what the bubble said lately, or /cockpit demo [state] to see Clawd's states." }
  })

  // A release on a press target (press.tsx) runs the press registered under its key.
  on('ui.message', async ($, e, next) => {
    presses.get(e.element)?.()
    return next(e)
  }).catch(($, e, next) => next(e))

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
    // A survey holds the band too, and the cockpit stays under it. A question from Claude has its own dialog: the band
    // is drawn there (the AskUserQuestion hook below), so it steps aside here and is never on screen twice.
    if (mood.dialog) return below

    await read($, tick)
    if (await read($, isSide)) {
      try {
        const panes = await $.ui.panes()
        if (panes.some(p => p.id === PANE && p.isPlaced)) return below
      } catch {
        // No way to tell: draw the band.
      }
    }
    const mine = await bandTree($, e, { isWorking: e.props.isWorking, bodyColumns: e.props.bodyColumns, compact: false })
    return stack(below, mine, $.ui.resolve(e).Box)
  })

  // The dialog of a question from Claude replaces the prompt area, so the band above the prompt goes with it: draw the band
  // over the dialog instead, with the engine's own dialog kept once beneath it. The dialog's row budget is small on the
  // terminal (12 rows), so there the band is one row, without the speech.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const dialog = await next(e)
    if (!mood.dialog) {
      // The band above the prompt steps aside from now on (see its hook): one redraw so it does.
      mood.dialog = true
      $.clock.after(0, () => $.ui.invalidate('ui.render'))
    }
    try {
      const { Box } = $.ui.resolve(e)
      const mine = await bandTree($, e, { isWorking: true, bodyColumns: e.viewport?.columns ?? 80, compact: e.surface === 'terminal', plain: true })
      return h(Box as never, { key: 'ask-band', flexDirection: 'column' } as never, mine as never, dialog as never) as never
    } catch {
      return dialog
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await snapshot($, false)
    const { Box, Text, Button } = $.ui.resolve(e)
    const Draw = ($.ui.resolve(e) as { Svg?: unknown }).Svg
    const c = { Box, Text, Button, Client: ($.ui.resolve(e as never) as { Client?: unknown }).Client, Svg: e.surface === 'terminal' ? undefined : Draw } as unknown as Comps
    const fx = makeFx($)
    const rows = speechText(s, c, fx, e.surface)
    if (e.surface === 'terminal') {
      return el(c.Box, { flexDirection: 'column' }, ...line(s.m, 6).map((seg, i) => el(c.Text, { key: `s${i}`, color: seg.fill }, seg.t)), ...(rows as never[]))
    }
    const { Svg } = $.ui.resolve(e)
    const dock = e.props.placement === 'dock'
    let drawn
    if (dock) {
      const svg = sideSvg(sideWidth(e.props.bodyColumns), s.m)
      drawn = el(Svg, { source: svg.source, alt: altText(s.m), width: svg.width, height: svg.height })
    } else {
      const parts = bandParts(bandWidth(e.props.bodyColumns), s.m, s.mascot)
      drawn = el(
        c.Box,
        { flexDirection: 'row', alignItems: 'center', gap: 1 },
        ...(parts.mascot ? [el(Svg, { key: 'mascot', source: parts.mascot.source, alt: STATES[s.state].label, isInteractive: true, width: parts.mascot.width, height: parts.mascot.height })] : []),
        el(Svg, { key: 'meters', source: parts.meters.source, alt: altText(s.m), width: parts.meters.width, height: parts.meters.height }),
      )
    }
    return el(
      c.Box,
      { flexDirection: 'column' },
      el(c.Box, { key: 'svg', justifyContent: 'center' }, drawn),
      ...(rows as never[]),
    )
  })
}
