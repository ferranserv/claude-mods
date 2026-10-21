// Clawd's states: what each looks like (frames), how fast it plays, and the words that go with it.
// The sheet in docs/mascot/clawd-sheet.html shows every one of them animated.
import { renderFrames, renderOnce } from './sprite'
import type { Pose } from './sprite'

export type StateId =
  | 'idle' | 'typing' | 'thinking' | 'bell' | 'coins' | 'walk' | 'talk' | 'drunk' | 'fire' | 'hourglass' | 'cold'
  | 'gauge' | 'mad' | 'sleepy' | 'asleep' | 'love' | 'detective' | 'oops' | 'wand' | 'hello' | 'idea' | 'coffee'
  | 'reading' | 'building' | 'browse' | 'plug' | 'dizzy' | 'lab' | 'hand' | 'writing'

type Def = {
  /** What a screen reader hears. */
  label: string
  /** The terminal has no drawings: a short text face instead. */
  face: string
  frames: Pose[]
  /** Seconds per frame. */
  fd: number
  /** Canvas width in sprite pixels (34 unless the scene is wider). */
  w?: number
  drift?: boolean
}

const OX = 5
const T: Pose = { eyes: 'half', look: 'down', laptop: 1 }
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

export const STATES: Record<StateId, Def> = {
  idle: { label: 'Clawd is relaxing in sunglasses', face: '(-_-)~', fd: 0.5, frames: range(4).map(() => ({ shades: 1, mouth: 'smile' })) },
  typing: { label: 'Clawd is typing on a laptop', face: '[o_o]>', fd: 0.16, frames: [0, 1, 0, 1].map(i => ({ ...T, armL: i ? 'type0' : 'type1', armR: i ? 'type1' : 'type0' })) },
  thinking: { label: 'Clawd is thinking', face: '(o_o)...', fd: 0.11, frames: range(8).map(t => ({ spinner: t, look: 'up', armR: 'chin' })) },
  bell: { label: 'Clawd rings a bell: the turn is finished', face: '(^o^)ding', fd: 0.1, frames: [0, -1, -1, 0, 1, 1, 0, -1, 0, 1].map((s, i) => ({ eyes: 'happy', mouth: 'open', armR: 'high', bell: s, notes: i })) },
  coins: { label: 'Clawd counts coins the saver kept', face: '($_$)', fd: 0.4, frames: [0, 1].map(t => ({ eyes: 'happy', mouth: 'smile', coins: t, star: t })) },
  walk: { label: 'Clawd walks in to start the session', face: '(o_o)/', fd: 0.16, drift: true, frames: [{ mouth: 'smile' }, { legsUp: [2, 7], mouth: 'smile', dy: -1 }, { mouth: 'smile' }, { mouth: 'smile', dy: -1 }, { mouth: 'smile' }, { legsUp: [4, 9], mouth: 'smile', dy: -1 }, { mouth: 'smile' }, { mouth: 'smile', dy: -1 }] },
  talk: { label: 'Clawd has something to say', face: '(o_o)"', fd: 0.22, frames: [{ armR: 'half', mouth: 'open' }, { armR: 'out', mouth: 'flat' }, { armR: 'half', armL: 'half', mouth: 'open' }, { armR: 'out', mouth: 'flat' }] },
  drunk: { label: 'Clawd is tipsy and wobbly: the context is getting full', face: '(@_@)~', fd: 0.14, frames: [0, 1, 1, 2, 2, 1, 0, -1, -1, -2, -2, -1].map((dx, i) => ({ dx, eyeL: i % 4 < 2 ? 'half' : 'wide', eyeR: i % 4 < 2 ? 'wide' : 'half', blush: 1, mouth: i % 6 === 0 ? 'o' : 'smile', armR: 'hold', bottle: (i % 4 < 2 ? 1 : 2), bubbles: i, dy: i % 6 === 3 ? 1 : 0 })) },
  fire: { label: 'Clawd is on fire: the context is nearly full', face: '(>_<)!!', fd: 0.16, frames: [0, 1, 2, 1].map((_, i) => ({ eyes: 'wide', mouth: 'o', flame: i % 3, forehead: i, armL: i % 2 ? 'half' : 'high', armR: i % 2 ? 'high' : 'half', dy: i % 2 })) },
  hourglass: { label: 'Clawd watches an hourglass: the prompt cache is about to expire', face: '(o_o)z', fd: 0.6, frames: range(4).map(sand => ({ eyes: 'open', look: 'right', mouth: 'flat', armR: 'up', hourglass: 1, sand })) },
  cold: { label: 'Clawd is frozen: the prompt cache is cold', face: '(-_-)*', fd: 0.45, frames: [1, 2, 3].map(snow => ({ pal: { c: '#8fb9d9', k: '#6d97b8', f: '#b6d5ea' }, eyes: 'half', mouth: 'grim', snow, ice: 1, armL: 'half', armR: 'half' })) },
  gauge: { label: 'Clawd checks a nearly empty gauge: today\'s allowance is almost used', face: '(o_o)!', fd: 0.35, frames: [{ look: 'left', eyes: 'wide', gauge: 2, bang: 1, bangX: OX + 20 }, { look: 'right', eyes: 'wide', gauge: 2, bang: 1, bangX: OX + 20, dy: 1 }] },
  mad: { label: 'Clawd is angry: over today\'s allowance', face: '(`o\')', fd: 0.22, frames: [0, 1, 2].map(t => ({ pal: { c: '#e2553f', k: '#b83a29', f: '#f08a74' }, eyes: 'angry', mouth: 'grim', steam: t, armL: 'up', armR: 'up', dy: t % 2 })) },
  sleepy: { label: 'Clawd is getting sleepy: the 5-hour limit is nearly used', face: '(-_-)z', fd: 0.6, frames: [{ eyes: 'half', z: 0 }, { eyes: 'half', dy: 1, z: 1 }, { eyes: 'blink', dy: 2, z: 2 }, { eyes: 'half', dy: 1, z: 1 }] },
  asleep: { label: 'Clawd is asleep with an alarm clock set: the 5-hour limit is reached', face: '(-.-)zZ', fd: 0.5, w: 56, frames: range(4).map(t => ({ dy: t % 3 === 1 ? 1 : 0, mask: 1, clock: '00:00', z: t, z2: (t + 2) % 4 })) },
  love: { label: 'Clawd hugs himself: the handoff is saved', face: '(^_^)<3', fd: 0.3, frames: range(6).map(t => ({ eyes: 'happy', mouth: 'smile', armL: 'cross', armR: 'cross', heart: t % 4 })) },
  detective: { label: 'Clawd the detective found something in the repo', face: '(o_o)?!', fd: 0.5, frames: [{ hat: 'fedora', eyes: 'half', look: 'right', magnifier: 1, armR: 'up', bang: 1, bangX: OX + 1 }, { hat: 'fedora', eyes: 'open', look: 'right', magnifier: 1, armR: 'up', dy: 1, bang: 1, bangX: OX + 1 }] },
  oops: { label: 'Clawd says oops: a tool failed', face: '(x_x)!', fd: 0.35, frames: [{ eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 }, { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, dy: 1 }] },
  wand: { label: 'Clawd the wizard enhanced your draft', face: '(^_^)*', fd: 0.4, frames: [{ hat: 'wizard', wand: 1, eyes: 'happy', mouth: 'smile', armR: 'up' }, { hat: 'wizard', wand: 1, eyes: 'open', mouth: 'smile', armR: 'up', star: 1 }] },
  hello: { label: 'Clawd waves hello', face: '(^_^)/', fd: 0.3, frames: [{ armR: 'high', mouth: 'smile', eyes: 'happy' }, { armR: 'up', mouth: 'smile', eyes: 'open' }] },
  idea: { label: 'Clawd has an idea: a plan is ready', face: '(o_o)!', fd: 0.4, frames: [{ bulb: 1, eyes: 'open', mouth: 'smile', armR: 'up' }, { bulb: 2, eyes: 'happy', mouth: 'smile', armR: 'up' }] },
  coffee: { label: 'Clawd drinks coffee: this turn is taking a while', face: '(-_-)c', fd: 0.5, frames: [0, 1].map(t => ({ cup: t + 1, armR: 'hold', mouth: 'smile', eyes: 'open' })) },
  reading: { label: 'Clawd is reading files, a stack of books beside him', face: '(o_o)=', fd: 0.8, frames: [{ glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }, { glasses: 1, book: 1, stack: 1, look: 'down', eyes: 'blink', armL: 'hold', armR: 'hold' }] },
  building: { label: 'Clawd is editing code with a hammer', face: '(>_<)T', fd: 0.22, frames: [0, 1].map(t => ({ hat: 'hard', wrench: t + 1, armR: 'up', mouth: 'smile', eyes: 'open' })) },
  browse: { label: 'Clawd is searching the web', face: '(o_o)Q', fd: 0.5, frames: [1, 2, 1, 2].map(b => ({ browser: b, glass: 1, look: 'right' })) },
  plug: { label: 'Clawd holds an unplugged cable: a connector is offline', face: '(;_;)~', fd: 0.4, frames: [0, 1].map(t => ({ plug: t, eyes: 'sad', mouth: 'grim', armL: 'half', armR: 'half', dy: t })) },
  dizzy: { label: 'Clawd is dizzy: the conversation is being compacted', face: '(@_@)', fd: 0.2, frames: [0, -1, 0, 1].map((dx, i) => ({ spiral: (i % 2) + 1, eyes: 'dizzy', dx, mouth: 'o' })) },
  lab: { label: 'Clawd holds bubbling flasks: the tests passed', face: '(^_^)8', fd: 0.35, frames: [0, 1, 2].map(t => ({ flask: t + 1, mouth: 'smile', eyes: t === 1 ? 'happy' : 'open' })) },
  hand: { label: 'Clawd holds a clipboard and a pencil: something needs your approval', face: '(o_o)[]', fd: 0.4, frames: [1, 2, 3, 3].map(clipboard => ({ clipboard, look: 'down', mouth: 'flat' })) },
  writing: { label: 'Clawd writes it down with a quill', face: '(o_o)~', fd: 0.4, frames: [1, 2, 3, 4].map(paper => ({ glasses: 1, paper, look: 'down', mouth: 'flat' })) },
}

/**
 * The cartoon layer: what the body does while the props play. Each frame can be held `each` times (the body then
 * moves faster than the props change), and `dx`/`dy` are the body's offsets in sprite pixels, cycled over the
 * frames: a hop, a sway, a shiver, a stomp. The legs stay planted, so a hop reads as a squash and stretch. The
 * first frame stays neutral (offset 0), and a frame that already sets its own offset keeps it.
 */
type Motion = { each?: number; dx?: number[]; dy?: number[] }
const MOTION: Partial<Record<StateId, Motion>> = {
  idle: { each: 2, dy: [0, 0, 1, 1, 1, 1, 0, 0] }, // breathes in the sun
  typing: { dy: [0, -1, 0, -1] }, // bounces with each tap
  thinking: { dx: [0, 0, 1, 1, 0, 0, -1, -1] }, // sways while the spinner turns
  coins: { each: 2, dy: [0, -2, 0, -1] }, // hops over the coins
  talk: { each: 2, dy: [0, -1, 0, 0, 0, -1, 0, 0] }, // nods as he talks
  fire: { dy: [0, -1, 0, -1], dx: [0, 1, -1, 0] }, // panics on the spot
  hourglass: { dx: [0, -1, 0, 0] }, // fidgets, waiting (props at the right edge: left only)
  cold: { each: 2, dx: [0, 1, 0, -1, 0, 1, 0, -1] }, // shivers
  gauge: { each: 2, dy: [0, 0, -1, 0] }, // startled hop
  mad: { each: 2, dy: [0, -1, 0, -1, 0, -1], dx: [0, 1, -1, 1, -1, 0] }, // stomps
  love: { dx: [0, 1, 1, 0, -1, -1] }, // sways in the hug
  detective: { each: 2, dx: [0, -1, -2, -1] }, // creeps along
  oops: { each: 2, dx: [0, 2, 0, -2] }, // shakes
  wand: { each: 2, dy: [0, -1, 0, 0] }, // flourish
  hello: { each: 2, dy: [0, -1, 0, -1] }, // bounces while he waves
  idea: { each: 2, dy: [0, -2, 0, 0] }, // eureka hop
  coffee: { each: 2, dy: [0, 0, 1, 0] }, // sips
  reading: { each: 2, dy: [0, 0, 1, 0] }, // turns the page
  building: { dy: [0, 1] }, // the body dips with each swing
  browse: { dx: [0, -1, -2, -1] }, // leans in to look
  plug: { each: 2, dx: [0, 1, 0, -1] }, // sags and sways
  lab: { each: 2, dy: [0, -1, 0, -1, 0, -1] }, // bubbles over
  hand: { dy: [0, 0, 1, 0] }, // taps his foot
  writing: { dy: [0, 0, 1, 0] }, // leans into the page
}
for (const [id, m] of Object.entries(MOTION) as [StateId, Motion][]) {
  const d = STATES[id]
  const each = m.each ?? 1
  const frames = d.frames.flatMap(f => Array.from({ length: each }, () => f))
  d.frames = frames.map((f, i) => {
    const out: Pose = { ...f }
    if (i === 0) {
      out.dx = out.dx ?? 0
      out.dy = out.dy ?? 0
      return out
    }
    if (m.dx && out.dx === undefined) out.dx = m.dx[i % m.dx.length]
    if (m.dy && out.dy === undefined) out.dy = m.dy[i % m.dy.length]
    return out
  })
  d.fd = d.fd / each
}

export const STATE_IDS = Object.keys(STATES) as StateId[]

export type Mascot = { markup: string; width: number; height: number }

/**
 * A move plays once between two states: props come on and off in these frames (sunglasses off, hard hat on, the
 * hammer raised), then the target state's own loop takes over. Pairs without a move cut straight to the new state.
 */
type Move = { frames: Pose[]; fd: number }
const LAPTOP: Pose = { laptop: 1, look: 'down', eyes: 'half', armL: 'type1', armR: 'type0' }
const SUN: Pose = { shades: 1, mouth: 'smile' }
const READY: Pose = { eyes: 'happy', mouth: 'open', armR: 'high', bell: 0, notes: 0 }
const MUSE: Pose = { spinner: 0, look: 'up', armR: 'chin' }
const OOPS: Pose = { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 }
const HAT: Pose = { hat: 'hard', wrench: 1, armR: 'up', mouth: 'smile', eyes: 'open' }
const READ: Pose = { glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }
export const MOVES: Partial<Record<string, Move>> = {
  'idle>thinking': { fd: 0.18, frames: [{ ...SUN }, { eyes: 'wide', armR: 'up', mouth: 'open' }, { ...MUSE }] },
  'thinking>typing': { fd: 0.15, frames: [{ ...MUSE }, { laptop: 1, look: 'down', eyes: 'half', armR: 'chin' }, { ...LAPTOP }] },
  'typing>building': { fd: 0.2, frames: [{ ...LAPTOP }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, { ...HAT }] },
  'building>typing': { fd: 0.2, frames: [{ ...HAT }, { hat: 'hard', look: 'down', armR: 'half' }, { ...LAPTOP }] },
  'typing>reading': { fd: 0.2, frames: [{ ...LAPTOP }, { glasses: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { ...READ }] },
  'reading>typing': { fd: 0.2, frames: [{ ...READ }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, look: 'down', eyes: 'half', armL: 'type1', armR: 'type0' }, { ...LAPTOP }] },
  'typing>oops': { fd: 0.25, frames: [{ ...LAPTOP }, { armL: 'high', armR: 'high', eyes: 'x', mouth: 'o' }, { ...OOPS }] },
  'oops>typing': { fd: 0.25, frames: [{ ...OOPS }, { look: 'down', eyes: 'half', mouth: 'flat', armL: 'type1', armR: 'type0' }, { ...LAPTOP }] },
  'typing>bell': { fd: 0.2, frames: [{ ...LAPTOP }, { ...READY }] },
  'bell>idle': { fd: 0.25, frames: [{ ...READY }, { ...SUN }] },
  'typing>hand': { fd: 0.25, frames: [{ ...LAPTOP }, { clipboard: 1, look: 'down', mouth: 'flat' }] },
  'thinking>hand': { fd: 0.25, frames: [{ ...MUSE }, { clipboard: 1, look: 'down', mouth: 'flat' }] },
  'hand>typing': { fd: 0.25, frames: [{ clipboard: 1, look: 'down', mouth: 'flat' }, { ...LAPTOP }] },
  'hello>idle': { fd: 0.2, frames: [{ armR: 'high', mouth: 'smile', eyes: 'happy' }, { armR: 'up', mouth: 'smile', eyes: 'open' }, { eyes: 'happy', mouth: 'smile' }, { ...SUN }] },
  'idle>typing': { fd: 0.2, frames: [{ ...SUN }, { eyes: 'open', mouth: 'smile' }, { ...LAPTOP }] },
  'idle>building': { fd: 0.2, frames: [{ ...SUN }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, { ...HAT }] },
  'idle>reading': { fd: 0.2, frames: [{ ...SUN }, { glasses: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { ...READ }] },
  'thinking>reading': { fd: 0.2, frames: [{ ...MUSE }, { glasses: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { ...READ }] },
  'thinking>building': { fd: 0.2, frames: [{ ...MUSE }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, { ...HAT }] },
  'walk>hello': { fd: 0.2, frames: [{ mouth: 'smile' }, { armR: 'up', mouth: 'smile', eyes: 'open' }, { armR: 'high', mouth: 'smile', eyes: 'happy' }] },
  'walk>idle': { fd: 0.2, frames: [{ mouth: 'smile' }, { ...SUN }] },
}

const NEUTRAL: Pose = { eyes: 'blink', mouth: 'smile' }

/**
 * The move between two states: the hand-drawn one when there is one, otherwise a morph. The morph drops what
 * he holds (a bare, blinking Clawd) and picks up the next thing, which works for any pair because every state
 * starts from the same neutral pose. Null only when nothing changes.
 */
function moveOf(from: StateId, to: StateId): (Move & { w: number }) | null {
  if (from === to) return null
  const m = MOVES[`${from}>${to}`]
  if (m) return { ...m, w: 34 }
  const a = STATES[from]
  const b = STATES[to]
  // Drawn on the canvas of the state he enters (the band's layout is fixed by it); a wider scene he leaves is skipped.
  const w = b.w ?? 34
  const first = (a.w ?? 34) <= w ? [a.frames[0] ?? {}] : []
  // Reading brings a lot with it (glasses, a book, a stack of books): they come and go one at a time, not all at once.
  if (to === 'reading') return { fd: 0.14, w, frames: [...first, { ...NEUTRAL }, { glasses: 1, look: 'down', eyes: 'half' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, b.frames[0] ?? {}] }
  if (from === 'reading') return { fd: 0.14, w, frames: [...first, { glasses: 1, stack: 1, look: 'down', eyes: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, { ...NEUTRAL }, b.frames[0] ?? {}] }
  return { fd: 0.12, w, frames: [...first, { ...NEUTRAL }, b.frames[0] ?? {}] }
}

/** How long a move plays, in ms; 0 when nothing changes. */
export function moveMs(from: StateId, to: StateId): number {
  const m = moveOf(from, to)
  return m ? Math.round(m.frames.length * m.fd * 1000) : 0
}

const moveCache = new Map<string, Mascot>()

/** The markup of one move at 2x (or 1x for the small size), or null when nothing changes. */
export function moveMarkup(from: StateId, to: StateId, scale: 1 | 2 = 2): Mascot | null {
  const key = `${from}>${to}@${scale}`
  const hit = moveCache.get(key)
  if (hit) return hit
  const m = moveOf(from, to)
  if (!m) return null
  const made = { markup: renderOnce(m.frames, m.fd, m.w, scale), width: m.w * scale, height: 28 * scale }
  moveCache.set(key, made)
  return made
}

const enterCache = new Map<string, Mascot>()

/**
 * What the band draws after a state change: the move and the new state's own loop in ONE drawing. The loop starts
 * when the move ends, so the drawing is replaced once per change, not twice (a replaced drawing reloads the whole
 * band, meters included, which showed as a blink).
 */
export function enterMarkup(from: StateId, to: StateId, clock = '', scale: 1 | 2 = 2): Mascot {
  const m = moveOf(from, to)
  if (!m) return stateMarkup(to, clock, scale)
  const key = `${from}>${to}${to === 'asleep' ? `:${clock}` : ''}@${scale}`
  const hit = enterCache.get(key)
  if (hit) return hit
  const d = STATES[to]
  const frames = to === 'asleep' && clock !== '' ? d.frames.map(f => ({ ...f, clock })) : d.frames
  const w = d.w ?? 34
  const dur = m.frames.length * m.fd
  const made = { markup: renderOnce(m.frames, m.fd, m.w, scale) + renderFrames(frames, d.fd, w, d.drift === true, scale, dur), width: w * scale, height: 28 * scale }
  enterCache.set(key, made)
  return made
}

/** The frames and canvas width of a move, for checking that it fits. */
export const moveFrames = (from: StateId, to: StateId): { frames: Pose[]; w: number } | null => moveOf(from, to)

const cache = new Map<string, Mascot>()

/** The markup of one state at 2x (or 1x for the small size). `clock` is the wake-up time the alarm shows while he sleeps. */
export function stateMarkup(id: StateId, clock = '', scale: 1 | 2 = 2): Mascot {
  const key = `${id === 'asleep' ? `${id}:${clock}` : id}@${scale}`
  const hit = cache.get(key)
  if (hit) return hit
  const d = STATES[id]
  const frames = id === 'asleep' && clock !== '' ? d.frames.map(f => ({ ...f, clock })) : d.frames
  const w = d.w ?? 34
  const made = { markup: renderFrames(frames, d.fd, w, d.drift === true, scale), width: w * scale, height: 28 * scale }
  cache.set(key, made)
  return made
}
