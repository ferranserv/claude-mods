// Clawd's states: what each looks like (frames), how fast it plays, and the words that go with it.
// The sheet in docs/mascot/clawd-sheet.html shows every one of them animated.
import { onceSeconds, pixelsOutside, renderFrames, renderOnce } from './sprite'
import type { Pose } from './sprite'

export type StateId =
  | 'idle' | 'typing' | 'thinking' | 'bell' | 'coins' | 'walk' | 'talk' | 'drunk' | 'fire' | 'hourglass' | 'cold'
  | 'gauge' | 'mad' | 'sleepy' | 'asleep' | 'love' | 'detective' | 'oops' | 'wand' | 'hello' | 'idea' | 'coffee'
  | 'reading' | 'building' | 'browse' | 'plug' | 'dizzy' | 'lab' | 'hand' | 'writing' | 'creating'

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
  typing: { label: 'Clawd is typing on a laptop', face: '[o_o]>', fd: 0.16, frames: [0, 1, 0, 1].map(i => ({ ...T, mouth: 'smile', armL: i ? 'type0' : 'type1', armR: i ? 'type1' : 'type0' })) },
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
  sleepy: { label: 'Clawd is getting sleepy and yawns, wide awake: the 5-hour limit is nearly used', face: '(-_-)z', fd: 0.4, frames: [{ eyes: 'open', z: 0 }, { eyes: 'open', dy: 1, z: 1 }, { eyes: 'open', mouth: 'o', armR: 'half' }, { eyes: 'happy', mouth: 'yawn', armR: 'up', dy: -1, z: 1 }, { eyes: 'happy', mouth: 'yawn', armR: 'up', dy: -1, z: 2 }, { eyes: 'open', mouth: 'o', armR: 'half', dy: 1 }, { eyes: 'open', dy: 1, z: 1 }] },
  asleep: { label: 'Clawd is asleep, collapsed on the alarm clock that is set beneath him: the 5-hour limit is reached', face: '(-.-)zZ', fd: 0.5, frames: range(4).map(t => ({ lift: 3, noLegs: 1, dy: [0, 1, 2, 1][t], mask: 1, clock: '00:00', zzz: t })) },
  love: { label: 'Clawd hugs himself: the handoff is saved', face: '(^_^)<3', fd: 0.3, frames: range(6).map(t => ({ eyes: 'happy', mouth: 'smile', armL: 'cross', armR: 'cross', heart: t % 4 })) },
  detective: { label: 'Clawd the detective found something in the repo', face: '(o_o)?!', fd: 0.5, frames: [{ hat: 'fedora', eyes: 'half', look: 'right', magnifier: 1, armR: 'up', mouth: 'flat', bang: 1, bangX: OX + 1 }, { hat: 'fedora', eyes: 'open', look: 'right', magnifier: 1, armR: 'up', mouth: 'o', dy: 1, bang: 1, bangX: OX + 1 }] },
  oops: { label: 'Clawd says oops: a tool failed', face: '(x_x)!', fd: 0.35, frames: [{ eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 }, { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, dy: 1 }] },
  wand: { label: 'Clawd the wizard enhanced your draft', face: '(^_^)*', fd: 0.4, frames: [{ hat: 'wizard', wand: 1, eyes: 'happy', mouth: 'smile', armR: 'up' }, { hat: 'wizard', wand: 1, eyes: 'open', mouth: 'smile', armR: 'up', star: 1 }] },
  hello: { label: 'Clawd waves hello', face: '(^_^)/', fd: 0.3, frames: [{ armR: 'high', mouth: 'smile', eyes: 'happy' }, { armR: 'up', mouth: 'smile', eyes: 'open' }] },
  idea: { label: 'Clawd has an idea: a plan is ready', face: '(o_o)!', fd: 0.4, frames: [{ bulb: 1, eyes: 'open', mouth: 'smile', armR: 'up' }, { bulb: 2, eyes: 'happy', mouth: 'smile', armR: 'up' }] },
  coffee: { label: 'Clawd drinks coffee: this turn is taking a while', face: '(-_-)c', fd: 0.5, frames: [0, 1].map(t => ({ cup: t + 1, armR: 'hold', mouth: 'smile', eyes: 'open' })) },
  reading: { label: 'Clawd is reading files, turning pages of a book, a stack of books beside him', face: '(o_o)=', fd: 0.5, frames: [{ glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }, { glasses: 1, book: 1, stack: 1, look: 'down', eyes: 'blink', armL: 'hold', armR: 'hold' }, { glasses: 1, book: 2, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }, { glasses: 1, book: 3, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }] },
  creating: { label: 'Clawd, a moustache on, holds a color palette and a paintbrush and is painting: Claude is writing a file', face: '(o_o)~', fd: 0.28, frames: [0, 1, 2, 3, 4, 2].map(brush => ({ stache: 1, palette: 1, brush, armR: 'half', armL: 'half', look: 'down', eyes: 'open', mouth: 'flat' })) },
  building: { label: 'Clawd is editing code with a hammer', face: '(>_<)T', fd: 0.22, frames: [0, 1].map(t => ({ hat: 'hard', wrench: t + 1, armR: 'up', mouth: 'smile', eyes: 'open' })) },
  browse: { label: 'Clawd is searching the web', face: '(o_o)Q', fd: 0.5, frames: [1, 2, 1, 2].map(b => ({ browser: b, glass: 1, look: 'right' })) },
  plug: { label: 'Clawd holds an unplugged cable: a connector is offline', face: '(;_;)~', fd: 0.4, frames: [0, 1].map(t => ({ plug: t, eyes: 'sad', mouth: 'grim', armL: 'half', armR: 'half', dy: t })) },
  dizzy: { label: 'Clawd is dizzy: the conversation is being compacted', face: '(@_@)', fd: 0.2, frames: [0, -1, 0, 1].map((dx, i) => ({ spiral: (i % 2) + 1, eyes: 'dizzy', dx, mouth: 'o' })) },
  lab: { label: 'Clawd holds bubbling flasks: the tests passed', face: '(^_^)8', fd: 0.35, frames: [0, 1, 2].map(t => ({ flask: t + 1, mouth: 'smile', eyes: t === 1 ? 'happy' : 'open' })) },
  hand: { label: 'Clawd holds a clipboard and a pencil and raises a hand: Claude asked you a question and waits for your answer', face: '(o_o)[]!', fd: 0.2, frames: [[1, 1], [1, 2], [2, 3], [2, 2], [3, 1], [3, 2], [3, 3], [3, 2]].map(([clipboard, bangC]) => ({ clipboard, look: 'down', mouth: 'flat', bangC })) },
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
  building: { dy: [0, 1] }, // the body dips with each swing
  creating: { each: 2, dx: [0, 1, 0, 0, -1, 0] }, // leans into each stroke
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
const LAPTOP: Pose = { laptop: 1, look: 'down', eyes: 'half', mouth: 'smile', armL: 'type1', armR: 'type0' }
const SUN: Pose = { shades: 1, mouth: 'smile' }
/** The first pose of a state: where a move into it ends and a move out of it begins, so there is no seam. */
const F = (id: StateId): Pose => ({ ...STATES[id].frames[0] })
const BARE: Pose = { eyes: 'blink', mouth: 'smile' }
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
  'typing>hand': { fd: 0.25, frames: [{ ...LAPTOP }, F('hand')] },
  'thinking>hand': { fd: 0.25, frames: [{ ...MUSE }, F('hand')] },
  'hand>typing': { fd: 0.25, frames: [F('hand'), { ...LAPTOP }] },
  'hello>idle': { fd: 0.2, frames: [{ armR: 'high', mouth: 'smile', eyes: 'happy' }, { armR: 'up', mouth: 'smile', eyes: 'open' }, { eyes: 'happy', mouth: 'smile' }, { ...SUN }] },
  'idle>typing': { fd: 0.2, frames: [{ ...SUN }, { eyes: 'open', mouth: 'smile' }, { ...LAPTOP }] },
  'idle>building': { fd: 0.2, frames: [{ ...SUN }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, { ...HAT }] },
  'idle>reading': { fd: 0.2, frames: [{ ...SUN }, { glasses: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { ...READ }] },
  'hand>building': { fd: 0.14, frames: [F('hand'), { ...BARE }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, F('building')] },
  'hand>thinking': { fd: 0.14, frames: [F('hand'), { ...BARE, look: 'up' }, F('thinking')] },
  'building>oops': { fd: 0.14, frames: [F('building'), { hat: 'hard', eyes: 'wide', mouth: 'o', armR: 'high' }, { eyes: 'x', mouth: 'o', armL: 'high', armR: 'high' }, F('oops')] },
  'oops>thinking': { fd: 0.14, frames: [F('oops'), { eyes: 'half', mouth: 'flat', look: 'up' }, F('thinking')] },
  'typing>lab': { fd: 0.14, frames: [F('typing'), { eyes: 'happy', mouth: 'smile', armR: 'up' }, F('lab')] },
  'lab>typing': { fd: 0.14, frames: [F('lab'), { eyes: 'open', mouth: 'smile', armR: 'half' }, F('typing')] },
  'lab>idle': { fd: 0.14, frames: [F('lab'), { eyes: 'happy', mouth: 'smile' }, F('idle')] },
  'building>reading': { fd: 0.14, frames: [F('building'), { hat: 'hard', look: 'down', armR: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, F('reading')] },
  'reading>building': { fd: 0.14, frames: [F('reading'), { glasses: 1, stack: 1, look: 'down', eyes: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, F('building')] },
  'building>bell': { fd: 0.14, frames: [F('building'), { hat: 'hard', eyes: 'happy', mouth: 'smile', armR: 'up' }, { eyes: 'happy', mouth: 'open', armR: 'high' }, F('bell')] },
  'reading>bell': { fd: 0.14, frames: [F('reading'), { glasses: 1, look: 'down', eyes: 'happy' }, { eyes: 'happy', mouth: 'open', armR: 'high' }, F('bell')] },
  'thinking>bell': { fd: 0.14, frames: [F('thinking'), { look: 'up', armR: 'up', eyes: 'wide', mouth: 'o' }, { eyes: 'happy', mouth: 'open', armR: 'high' }, F('bell')] },
  'bell>thinking': { fd: 0.14, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { look: 'up', armR: 'chin', eyes: 'open' }, F('thinking')] },
  'typing>coffee': { fd: 0.14, frames: [F('typing'), { look: 'down', eyes: 'half', mouth: 'smile', armR: 'half' }, { eyes: 'open', mouth: 'smile', armR: 'hold' }, F('coffee')] },
  'coffee>typing': { fd: 0.14, frames: [F('coffee'), { eyes: 'open', mouth: 'smile', armR: 'half' }, { look: 'down', eyes: 'half', armR: 'half' }, F('typing')] },
  'thinking>coffee': { fd: 0.14, frames: [F('thinking'), { look: 'up', eyes: 'half', mouth: 'flat' }, { eyes: 'half', mouth: 'smile', armR: 'hold' }, F('coffee')] },
  'typing>browse': { fd: 0.14, frames: [F('typing'), { laptop: 1, look: 'right', eyes: 'open', armL: 'type1', armR: 'type0' }, { look: 'right', eyes: 'open', glass: 1 }, F('browse')] },
  'browse>typing': { fd: 0.14, frames: [F('browse'), { look: 'right', eyes: 'open', glass: 1 }, { laptop: 1, look: 'right', eyes: 'open', armL: 'type1', armR: 'type0' }, F('typing')] },
  'thinking>browse': { fd: 0.14, frames: [F('thinking'), { look: 'right', eyes: 'open' }, { look: 'right', glass: 1 }, F('browse')] },
  'idle>writing': { fd: 0.14, frames: [F('idle'), { eyes: 'open', mouth: 'smile' }, { glasses: 1, look: 'down', mouth: 'flat' }, F('writing')] },
  'writing>love': { fd: 0.14, frames: [F('writing'), { glasses: 1, look: 'down', eyes: 'happy', mouth: 'smile' }, { eyes: 'happy', mouth: 'smile', armL: 'half', armR: 'half' }, F('love')] },
  'writing>idle': { fd: 0.14, frames: [F('writing'), { glasses: 1, look: 'down', eyes: 'open', mouth: 'smile' }, { eyes: 'open', mouth: 'smile' }, F('idle')] },
  'love>idle': { fd: 0.14, frames: [F('love'), { eyes: 'happy', mouth: 'smile', armL: 'half', armR: 'half' }, F('idle')] },
  'typing>dizzy': { fd: 0.14, frames: [F('typing'), { laptop: 1, eyes: 'dizzy', mouth: 'o', look: 'down', armL: 'type1', armR: 'type0' }, F('dizzy')] },
  'dizzy>typing': { fd: 0.14, frames: [F('dizzy'), { laptop: 1, eyes: 'half', mouth: 'o', look: 'down', armL: 'type1', armR: 'type0' }, F('typing')] },
  'idle>wand': { fd: 0.14, frames: [F('idle'), { eyes: 'wide', mouth: 'o' }, { hat: 'wizard', eyes: 'happy', mouth: 'smile' }, F('wand')] },
  'wand>idle': { fd: 0.14, frames: [F('wand'), { hat: 'wizard', eyes: 'open', mouth: 'smile' }, { eyes: 'open', mouth: 'smile' }, F('idle')] },
  'hello>thinking': { fd: 0.14, frames: [F('hello'), { armR: 'up', mouth: 'smile', eyes: 'open' }, F('thinking')] },
  'thinking>reading': { fd: 0.2, frames: [{ ...MUSE }, { glasses: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, { ...READ }] },
  'thinking>building': { fd: 0.2, frames: [{ ...MUSE }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, { ...HAT }] },
  'walk>hello': { fd: 0.2, frames: [{ mouth: 'smile' }, { armR: 'up', mouth: 'smile', eyes: 'open' }, { armR: 'high', mouth: 'smile', eyes: 'happy' }] },
  'walk>idle': { fd: 0.2, frames: [{ mouth: 'smile' }, { ...SUN }] },
}

const NEUTRAL: Pose = { eyes: 'blink', mouth: 'smile' }

/** Going to bed: the alarm clock rises under his feet and pushes him up, he hops, his legs fold away and he slumps onto it, asleep (mask, then the Zs). */
const RISE: Pose[] = [
  { lift: 0, clockY: 26, clock: '00:00', eyes: 'wide', mouth: 'o' },
  { lift: 1, clockY: 24, clock: '00:00', eyes: 'wide', mouth: 'o', armL: 'up', armR: 'up' },
  { lift: 2, clockY: 22, clock: '00:00', eyes: 'wide', mouth: 'o', armL: 'up', armR: 'up' },
  { lift: 3, clockY: 19, dy: -1, clock: '00:00', eyes: 'wide', mouth: 'o', armL: 'up', armR: 'up' },
  { lift: 3, noLegs: 1, dy: 2, clock: '00:00', eyes: 'half', mouth: 'o' },
  { lift: 3, noLegs: 1, dy: 1, clock: '00:00', eyes: 'half', mouth: 'flat', zzz: 0 },
]

/** Props he wears or holds: when one goes or comes, his hand takes it or fetches it. */
const HELD = ['shades', 'hat', 'glasses', 'laptop', 'book', 'stack', 'scroll', 'clipboard', 'cup', 'flask', 'glass', 'browser', 'bell', 'wrench', 'paper', 'bulb', 'wand']
/** The drawing of a prop in his hand: a hat is told apart by its kind (hard hat, fedora, wizard hat). */
const carried = (k: string, p: Pose): string => (k === 'hat' ? `hat-${p.hat}` : k)
const without = (p: Pose, ks: string[]): Pose => {
  const o: Pose = { ...p }
  for (const k of ks) delete o[k]
  return o
}

/**
 * Between two frames, a prop that goes away is taken by his hand: the hand reaches it, lifts it away from where it
 * was (shown small in his hand), and the arm swings out to put it behind him, out of sight. A prop that comes is
 * fetched the other way: the arm swings out, brings it up, and it goes on. The frames on either side are
 * untouched, so a move still meets its neighbours.
 */
function stage(frames: Pose[]): Pose[] {
  const out: Pose[] = []
  frames.forEach((g, i) => {
    const f = frames[i - 1]
    if (f) {
      // Present means defined: the bell's rest position is 0, which is still a bell.
      const gone = HELD.filter(k => f[k] !== undefined && g[k] === undefined)
      const came = HELD.filter(k => f[k] === undefined && g[k] !== undefined)
      let cur = f
      if (gone.length) {
        const k = carried(gone[0]!, f)
        out.push({ ...cur, armR: 'up' })
        out.push({ ...without(cur, gone), armR: 'up', carry: k, at: 1 })
        out.push({ ...without(cur, gone), armR: 'out', carry: k, at: 3 })
        cur = without(cur, gone)
      }
      if (came.length) {
        const k = carried(came[0]!, g)
        out.push({ ...cur, armR: 'out', carry: k, at: 3 })
        out.push({ ...cur, armR: 'up', carry: k, at: 1 })
      }
    }
    out.push(g)
  })
  return out
}

/**
 * What makes a move read as one motion and not a slideshow: props are taken and fetched by hand (stage), the first
 * frame is short (he is already moving), a blink covers the middle, a small hop gives the change some life, and
 * the last frame holds a little longer so he settles into the state. The ends stay as they are.
 */
function smooth(frames: Pose[]): Pose[] {
  const staged = stage(frames)
  const n = staged.length
  if (n < 3) return staged
  const mid = Math.floor((n - 1) / 2)
  return staged.map((f, i) => {
    if (i === 0) return { ...f, hold: 0.6 }
    if (i === n - 1) return { ...f, hold: 1.3 }
    const out: Pose = { ...f }
    if (i === mid && (out.eyes === undefined || out.eyes === 'open' || out.eyes === 'half')) out.eyes = 'blink'
    // The hop only happens where it fits: overhead props (a spinner, a spiral) would leave the top of the canvas.
    if (out.dy === undefined && i % 2 === 1 && pixelsOutside([{ ...out, dy: -1 }], 34) === 0) out.dy = -1
    return out
  })
}

/** Slow enough to see (a frame is at least MOVE_FD), but never longer than MOVE_MAX_S in all; leaving the raised hand is quick. */
const MOVE_FD = 0.2
const MOVE_MAX_S = 2.2
function paced(frames: Pose[], from: StateId): { fd: number; frames: Pose[] } {
  const cap = from === 'hand' ? 0.7 : MOVE_MAX_S
  const total = onceSeconds(frames, MOVE_FD)
  return { fd: total > cap ? (MOVE_FD * cap) / total : MOVE_FD, frames }
}

/** His colors when he is warm and when the cache has frozen him. */
const WARM_PAL = { c: '#DA7758', k: '#b5593d', f: '#f0a07c' }
const COLD_PAL = STATES.cold.frames[0]!.pal as Record<string, string>
const COLD_MOVE_S = 2
const WARM_MOVE_S = 1.2
const mixHex = (a: string, b: string, t: number): string => {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map(i => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Going to or from cold is a slow change of color: his body goes from orange to ice blue (or back) a little with
 * every frame, over COLD_MOVE_S (WARM_MOVE_S coming back). The first frame is the state he leaves, the last his
 * first in the one he enters, both with their own colors.
 */
function tinted(frames: Pose[], toCold: boolean): { fd: number; frames: Pose[] } {
  const n = frames.length
  const out = frames.map((f, i) => {
    const t = toCold ? i / (n - 1) : 1 - i / (n - 1)
    if (i === 0 || i === n - 1) return f
    return { ...f, pal: { c: mixHex(WARM_PAL.c, COLD_PAL.c!, t), k: mixHex(WARM_PAL.k, COLD_PAL.k!, t), f: mixHex(WARM_PAL.f, COLD_PAL.f!, t) } }
  })
  const weight = out.reduce((a, f) => a + (f.hold ?? 1), 0)
  return { fd: (toCold ? COLD_MOVE_S : WARM_MOVE_S) / weight, frames: out }
}

/**
 * The move between two states: the hand-drawn one when there is one, otherwise a morph. The morph drops what
 * he holds (a bare, blinking Clawd) and picks up the next thing, which works for any pair because every state
 * starts from the same neutral pose. Null only when nothing changes.
 */
function moveOf(from: StateId, to: StateId): (Move & { w: number }) | null {
  if (from === to) return null
  const m = MOVES[`${from}>${to}`]
  if (m) return { ...paced(smooth(m.frames), from), w: 34 }
  const a = STATES[from]
  const b = STATES[to]
  // Drawn on the canvas of the state he enters (the band's layout is fixed by it); a wider scene he leaves is skipped.
  const w = b.w ?? 34
  const first = (a.w ?? 34) <= w ? [a.frames[0] ?? {}] : []
  if (to === 'cold' || from === 'cold') {
    const mid: Pose[] = [{ ...NEUTRAL }, { eyes: 'half', mouth: 'grim' }, { eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half' }, { eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half' }]
    return { ...tinted(smooth([...first, ...mid, b.frames[0] ?? {}]), to === 'cold'), w }
  }
  if (to === 'asleep') return { ...paced(smooth([...first, { ...NEUTRAL, eyes: 'open' }, ...RISE, b.frames[0] ?? {}]), from), w }
  // Reading brings a lot with it (glasses, a book, a stack of books): they come and go one at a time, not all at once.
  if (to === 'reading') return { ...paced(smooth([...first, { ...NEUTRAL }, { glasses: 1, look: 'down', eyes: 'half' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, b.frames[0] ?? {}]), from), w }
  if (from === 'reading') return { ...paced(smooth([...first, { glasses: 1, stack: 1, look: 'down', eyes: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, { ...NEUTRAL }, b.frames[0] ?? {}]), from), w }
  return { ...paced(smooth([...first, { ...NEUTRAL }, b.frames[0] ?? {}]), from), w }
}

/** How long a move plays, in ms; 0 when nothing changes. */
export function moveMs(from: StateId, to: StateId): number {
  const m = moveOf(from, to)
  return m ? Math.round(onceSeconds(m.frames, m.fd) * 1000) : 0
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
  const rise = to === 'asleep' && clock !== '' ? m.frames.map(f => (f.clock ? { ...f, clock } : f)) : m.frames
  const dur = onceSeconds(rise, m.fd)
  const made = { markup: renderOnce(rise, m.fd, m.w, scale) + renderFrames(frames, d.fd, w, d.drift === true, scale, dur), width: w * scale, height: 28 * scale }
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
