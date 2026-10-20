// Clawd's states: what each looks like (frames), how fast it plays, and the words that go with it.
// The sheet in docs/mascot/clawd-sheet.html shows every one of them animated.
import { renderFrames } from './sprite'
import type { Pose } from './sprite'

export type StateId =
  | 'idle' | 'typing' | 'thinking' | 'bell' | 'coins' | 'walk' | 'talk' | 'drunk' | 'fire' | 'hourglass' | 'cold'
  | 'gauge' | 'mad' | 'sleepy' | 'asleep' | 'love' | 'detective' | 'oops' | 'wand' | 'hello' | 'idea' | 'coffee'
  | 'reading' | 'building' | 'browse' | 'plug' | 'dizzy' | 'lab' | 'hand'

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
  idle: { label: 'Clawd is lounging on a beach', face: '(-_-)~', fd: 0.5, frames: range(4).map(i => ({ beach: i, shades: 1, mouth: 'smile', armR: 'half', drink: i === 1 || i === 2 ? 2 : 1 })) },
  typing: { label: 'Clawd is typing on a laptop', face: '[o_o]>', fd: 0.16, frames: [0, 1, 0, 1].map(i => ({ ...T, armL: i ? 'type0' : 'type1', armR: i ? 'type1' : 'type0' })) },
  thinking: { label: 'Clawd is thinking', face: '(o_o)...', fd: 0.11, frames: range(8).map(t => ({ spinner: t, look: 'up', armR: 'chin' })) },
  bell: { label: 'Clawd rings a bell: the turn is finished', face: '(^o^)ding', fd: 0.14, frames: [-1, 0, 1, 0].map((s, i) => ({ eyes: 'happy', mouth: 'open', armR: 'high', bell: s, notes: i })) },
  coins: { label: 'Clawd counts coins the saver kept', face: '($_$)', fd: 0.4, frames: [0, 1].map(t => ({ eyes: 'happy', mouth: 'smile', coins: t, star: t })) },
  walk: { label: 'Clawd walks in to start the session', face: '(o_o)/', fd: 0.2, drift: true, frames: [{ legsUp: [2, 7], mouth: 'smile' }, { dy: -1, mouth: 'smile' }, { legsUp: [4, 9], mouth: 'smile' }, { dy: -1, mouth: 'smile' }] },
  talk: { label: 'Clawd has something to say', face: '(o_o)"', fd: 0.22, frames: [{ armR: 'half', mouth: 'open' }, { armR: 'out', mouth: 'flat' }, { armR: 'half', armL: 'half', mouth: 'open' }, { armR: 'out', mouth: 'flat' }] },
  drunk: { label: 'Clawd is tipsy and wobbly: the context is getting full', face: '(@_@)~', fd: 0.22, frames: [-2, -1, 0, 1, 2, 1, 0, -1].map((dx, i) => ({ dx, eyeL: i % 2 ? 'half' : 'wide', eyeR: i % 2 ? 'wide' : 'half', blush: 1, mouth: i % 3 === 0 ? 'o' : 'smile', armR: 'hold', bottle: (i % 2) + 1, bubbles: i, dy: i % 4 === 2 ? 1 : 0 })) },
  fire: { label: 'Clawd is on fire: the context is nearly full', face: '(>_<)!!', fd: 0.16, frames: [0, 1, 2, 1].map((_, i) => ({ eyes: 'wide', mouth: 'o', flame: i % 3, forehead: i, armL: i % 2 ? 'half' : 'high', armR: i % 2 ? 'high' : 'half', dy: i % 2 })) },
  hourglass: { label: 'Clawd watches an hourglass: the prompt cache is about to expire', face: '(o_o)z', fd: 0.6, frames: range(4).map(sand => ({ eyes: 'open', look: 'right', mouth: 'flat', armR: 'up', hourglass: 1, sand })) },
  cold: { label: 'Clawd is frozen: the prompt cache is cold', face: '(-_-)*', fd: 1, frames: [{ pal: { c: '#8fb9d9', k: '#6d97b8', f: '#b6d5ea' }, eyes: 'half', mouth: 'grim', snow: 1, ice: 1, armL: 'half', armR: 'half' }] },
  gauge: { label: 'Clawd checks a nearly empty gauge: today\'s allowance is almost used', face: '(o_o)!', fd: 0.35, frames: [{ look: 'left', eyes: 'wide', gauge: 2, bang: 1, bangX: OX + 20 }, { look: 'right', eyes: 'wide', gauge: 2, bang: 1, bangX: OX + 20, dy: 1 }] },
  mad: { label: 'Clawd is angry: over today\'s allowance', face: '(`o\')', fd: 0.22, frames: [0, 1, 2].map(t => ({ pal: { c: '#e2553f', k: '#b83a29', f: '#f08a74' }, eyes: 'angry', mouth: 'grim', steam: t, armL: 'up', armR: 'up', dy: t % 2 })) },
  sleepy: { label: 'Clawd is getting sleepy: the 5-hour limit is nearly used', face: '(-_-)z', fd: 0.6, frames: [{ eyes: 'half', dy: 1, z: 0 }, { eyes: 'half', dy: 2, z: 1 }, { eyes: 'blink', dy: 2, z: 2 }, { eyes: 'half', dy: 1, z: 1 }] },
  asleep: { label: 'Clawd is asleep with an alarm clock set: the 5-hour limit is reached', face: '(-.-)zZ', fd: 0.5, w: 56, frames: range(4).map(t => ({ dy: t % 3 === 1 ? 1 : 0, mask: 1, clock: '00:00', z: t, z2: (t + 2) % 4 })) },
  love: { label: 'Clawd hugs himself: the handoff is saved', face: '(^_^)<3', fd: 0.35, frames: range(4).map(t => ({ eyes: 'happy', mouth: 'smile', armL: 'cross', armR: 'cross', heart: t })) },
  detective: { label: 'Clawd the detective found something in the repo', face: '(o_o)?!', fd: 0.5, frames: [{ hat: 'fedora', eyes: 'half', look: 'right', magnifier: 1, armR: 'up', bang: 1, bangX: OX + 1 }, { hat: 'fedora', eyes: 'open', look: 'right', magnifier: 1, armR: 'up', dy: 1, bang: 1, bangX: OX + 1 }] },
  oops: { label: 'Clawd says oops: a tool failed', face: '(x_x)!', fd: 0.35, frames: [{ eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 }, { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, dy: 1 }] },
  wand: { label: 'Clawd the wizard enhanced your draft', face: '(^_^)*', fd: 0.4, frames: [{ hat: 'wizard', wand: 1, eyes: 'happy', mouth: 'smile', armR: 'up' }, { hat: 'wizard', wand: 1, eyes: 'open', mouth: 'smile', armR: 'up', star: 1 }] },
  hello: { label: 'Clawd waves hello', face: '(^_^)/', fd: 0.3, frames: [{ armR: 'high', mouth: 'smile', eyes: 'happy' }, { armR: 'up', mouth: 'smile', eyes: 'open' }] },
  idea: { label: 'Clawd has an idea: a plan is ready', face: '(o_o)!', fd: 0.4, frames: [{ bulb: 1, eyes: 'wide', mouth: 'open', armR: 'up' }, { bulb: 2, eyes: 'open', mouth: 'smile', armR: 'up' }] },
  coffee: { label: 'Clawd drinks coffee: this turn is taking a while', face: '(-_-)c', fd: 0.5, frames: [0, 1].map(t => ({ cup: t + 1, armR: 'hold', mouth: 'smile', eyes: 'open' })) },
  reading: { label: 'Clawd is reading files', face: '(o_o)=', fd: 0.8, frames: [{ glasses: 1, scroll: 1, look: 'down', armL: 'hold', armR: 'hold' }, { glasses: 1, scroll: 1, look: 'down', eyes: 'blink', armL: 'hold', armR: 'hold' }] },
  building: { label: 'Clawd is editing code with a hammer', face: '(>_<)T', fd: 0.22, frames: [0, 1].map(t => ({ hat: 'hard', wrench: t + 1, armR: 'up', mouth: 'smile', eyes: 'open' })) },
  browse: { label: 'Clawd is searching the web', face: '(o_o)Q', fd: 0.5, frames: [1, 2, 1, 2].map(b => ({ browser: b, glass: 1, look: 'right' })) },
  plug: { label: 'Clawd holds an unplugged cable: a connector is offline', face: '(;_;)~', fd: 0.4, frames: [0, 1].map(t => ({ plug: t, eyes: 'sad', mouth: 'grim', armL: 'half', armR: 'half', dy: t })) },
  dizzy: { label: 'Clawd is dizzy: the conversation is being compacted', face: '(@_@)', fd: 0.3, frames: [{ spiral: 1, eyes: 'dizzy', dx: -1, mouth: 'o' }, { spiral: 2, eyes: 'dizzy', dx: 1, mouth: 'o' }] },
  lab: { label: 'Clawd holds bubbling flasks: the tests passed', face: '(^_^)8', fd: 0.35, frames: [0, 1, 2].map(t => ({ flask: t + 1, mouth: 'smile', eyes: t === 1 ? 'happy' : 'open' })) },
  hand: { label: 'Clawd raises a hand: something needs your approval', face: '(o_o)/!', fd: 0.35, frames: [{ armR: 'high', mouth: 'flat', bang: 1, bangX: OX + 26 }, { armR: 'up', mouth: 'flat', bang: 1, bangX: OX + 26, dy: 1 }] },
}

export const STATE_IDS = Object.keys(STATES) as StateId[]

export type Mascot = { markup: string; width: number; height: number }

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
