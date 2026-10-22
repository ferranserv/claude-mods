// Clawd's states: what each looks like (frames), how fast it plays, and the words that go with it.
// The sheet in docs/mascot/clawd-sheet.html shows every one of them animated.
import { onceSeconds, pixelsOutside, renderFrames, renderOnce } from './sprite'
import type { Pose } from './sprite'

export type StateId =
  | 'idle' | 'typing' | 'thinking' | 'bell' | 'coins' | 'walk' | 'talk' | 'drunk' | 'fire' | 'hourglass' | 'cold'
  | 'gauge' | 'mad' | 'sleepy' | 'asleep' | 'love' | 'detective' | 'oops' | 'wand' | 'hello' | 'idea' | 'coffee'
  | 'reading' | 'building' | 'browse' | 'plug' | 'dizzy' | 'lab' | 'hand' | 'writing' | 'creating' | 'boom' | 'ship' | 'running' | 'fishing'

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

// Typing and running are the same drawing; running adds lines of code scrolling up behind him (2 px a frame: 16 frames, one 32-row pattern).
const TYPING: Pose[] = [0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 0, 0, 0, 0, 0, 0].map((gum, i) => ({ ...T, mouth: gum === 0 ? (i % 4 < 2 ? 'focus' : 'chew') : gum === 4 ? 'o' : 'chewOpen', ...(gum === 0 ? {} : { gum }), armL: i % 2 ? 'type0' : 'type1', armR: i % 2 ? 'type1' : 'type0', ...(i === 12 || i === 13 ? { armL: 'up', armR: 'type0' } : {}) }))

export const STATES: Record<StateId, Def> = {
  idle: { label: 'Clawd is relaxing in sunglasses', face: '(-_-)~', fd: 0.5, frames: [
    { shades: 1, mouth: 'smile', hold: 6 },
    { shades: 1, mouth: 'smile', armL: 'half', hold: 2 },
    { shades: 1, mouth: 'smile', armL: 'up', hold: 4 },
    { shades: 1, mouth: 'smile', armL: 'half', hold: 2 },
    { shades: 1, mouth: 'smile', hold: 7 },
    { shades: 1, mouth: 'smile', armR: 'half', hold: 2 },
    { shades: 1, mouth: 'smile', hold: 3 },
  ] },
  typing: { label: 'Clawd is typing on a laptop, chewing gum and blowing bubbles', face: '[o_o]>', fd: 0.16, frames: TYPING },
  running: { label: 'Clawd types on his laptop, chewing gum, while lines of code scroll by behind him: a command is running', face: '[o_o]>>', fd: 0.16, frames: TYPING.map((f, i) => ({ ...f, code: i * 2 })) },
  fishing: { label: 'Clawd goes fishing in a bucket hat: a background task is still running', face: '(o_o)J', fd: 0.2, frames: fishingLoop() },
  thinking: { label: 'Clawd is thinking', face: '(o_o)...', fd: 0.11, frames: range(16).map(i => ({ spinner: i % 8, look: i < 6 ? 'up' : i < 10 ? 'right' : i < 13 ? 'up' : 'left', armR: 'chin', ...(i >= 3 && i <= 12 ? { armL: i <= 4 || i >= 11 ? 'half' : 'up' } : {}) })) },
  bell: { label: 'Clawd rings a bell: the turn is finished', face: '(^o^)ding', fd: 0.1, frames: [0, -1, -1, 0, 1, 1, 0, -1, 0, 1].map((s, i) => ({ eyes: 'happy', mouth: 'open', armR: 'high', bell: s, notes: i, ...(i === 1 || i === 9 ? { armL: 'half' } : i > 1 ? { armL: 'up' } : {}) })) },
  coins: { label: 'Clawd counts coins the saver kept', face: '($_$)', fd: 0.4, frames: [0, 1, 0, 1, 0, 1].map((t, i) => ({ eyes: 'happy', mouth: 'smile', coins: t, star: t, ...(i === 1 || i === 5 ? { armL: 'half' } : i >= 2 && i <= 4 ? { armL: 'up' } : {}) })) },
  walk: { label: 'Clawd walks in to start the session', face: '(o_o)/', fd: 0.16, drift: true, frames: [
    { mouth: 'smile' },
    { legsUp: [2, 7], mouth: 'smile', dy: -1, armL: 'half' },
    { mouth: 'smile', armL: 'half' },
    { mouth: 'smile', dy: -1 },
    { mouth: 'smile' },
    { legsUp: [4, 9], mouth: 'smile', dy: -1, armR: 'half' },
    { mouth: 'smile', armR: 'half' },
    { mouth: 'smile', dy: -1 },
  ] },
  talk: { label: 'Clawd has something to say', face: '(o_o)"', fd: 0.22, frames: [
    { armR: 'half', mouth: 'open' },
    { armR: 'out', mouth: 'flat' },
    { armR: 'half', armL: 'half', mouth: 'open' },
    { armR: 'out', armL: 'half', mouth: 'flat' },
    { armR: 'half', mouth: 'open' },
    { armR: 'out', mouth: 'flat' },
    { armR: 'half', armL: 'half', mouth: 'open' },
    { armR: 'half', armL: 'half', mouth: 'flat' },
  ] },
  drunk: { label: 'Clawd is tipsy and wobbly: the context is getting full', face: '(@_@)~', fd: 0.14, frames: [0, 1, 1, 2, 2, 1, 0, -1, -1, -2, -2, -1].map((dx, i) => ({ dx, eyeL: i % 8 < 4 ? 'half' : 'wide', eyeR: i % 8 < 4 ? 'wide' : 'half', blush: 1, mouth: i % 6 < 2 ? 'o' : 'smile', armR: 'hold', bottle: (i % 4 < 2 ? 1 : 2), bubbles: i, dy: i % 6 === 3 ? 1 : 0, ...(i === 0 || i === 1 || i === 2 || i === 5 || i === 6 || i >= 9 ? { armL: 'half' } : i === 3 || i === 4 ? { armL: 'out' } : i === 7 || i === 8 ? { armL: 'up' } : {}) })) },
  fire: { label: 'Clawd is on fire: the context is nearly full', face: '(>_<)!!', fd: 0.16, frames: [0, 1, 2, 1, 0, 1, 2, 1].map((_, i) => ({ eyes: 'wide', mouth: 'o', flame: i % 3, armL: i % 2 ? 'half' : 'high', armR: i % 2 ? 'high' : 'half', dy: i % 2 })) },
  hourglass: { label: 'Clawd watches an hourglass: the prompt cache is about to expire', face: '(o_o)z', fd: 0.2, frames: [
    { eyes: 'open', look: 'right', mouth: 'flat', armR: 'out', hourglass: 1, sand: 0, hold: 5 },
    { eyes: 'open', look: 'right', mouth: 'flat', armR: 'out', hourglass: 1, sand: 1, armL: 'half', hold: 5 },
    { eyes: 'open', look: 'right', mouth: 'flat', armR: 'out', hourglass: 1, sand: 2, armL: 'half', hold: 5 },
    { eyes: 'open', look: 'right', mouth: 'flat', armR: 'out', hourglass: 1, sand: 3, hold: 4 },
    { eyes: 'half', look: 'right', mouth: 'flat', armR: 'out', hgTurn: 1, hold: 2 },
  ] },
  cold: { label: 'Clawd is frozen: the prompt cache is cold', face: '(-_-)*', fd: 0.16, frames: range(16).map(i => ({ pal: { c: '#8fb9d9', k: '#6d97b8', f: '#b6d5ea' }, eyes: 'open', mouth: i % 2 ? 'chatter2' : 'chatter', snow: i + 1, ice: 1, armL: i < 8 ? 'half' : 'cross', armR: i < 8 ? 'half' : 'cross' })) },
  gauge: { label: 'Clawd shakes a piggy bank upside-down and the last coin falls to the floor, bounces and rolls away: today\'s allowance is almost used', face: '(o_o)!', fd: 0.1, frames: [
    { pig: 1, armR: 'up', look: 'right', eyes: 'open', mouth: 'smile', hold: 6 },
    { pig: 1, armR: 'up', look: 'right', eyes: 'wide', mouth: 'smile', armL: 'half', hold: 2 },
    { pig: 1, pigFlip: 1, armR: 'up', look: 'right', eyes: 'open', mouth: 'o', armL: 'half', hold: 3 },
    { pig: 1, pigFlip: 1, armR: 'up', look: 'right', eyes: 'wide', mouth: 'o', armL: 'half', dy: 1, hold: 2 },
    { pig: 1, pigFlip: 1, armR: 'up', look: 'right', eyes: 'wide', mouth: 'o', armL: 'half', dy: -1, hold: 2 },
    { pig: 1, pigFlip: 1, armR: 'up', look: 'right', eyes: 'wide', mouth: 'o', armL: 'half', dy: 1, hold: 2 },
    { pig: 1, pigFlip: 1, armR: 'up', look: 'right', eyes: 'wide', mouth: 'o', armL: 'half', dy: -1, fcy: 11, hold: 2 },
    // the coin falls (it speeds up), lands on the floor, bounces twice and lies there a moment
    ...[14, 16, 19, 21].map(fcy => ({ pig: 1, pigFlip: 1, armR: 'up', look: 'down', eyes: 'wide', mouth: 'o', armL: 'half', fcy, hold: 1 })),
    ...[19, 21, 20, 21].map(fcy => ({ pig: 1, armR: 'up', look: 'down', eyes: 'wide', mouth: 'o', armL: 'half', fcy, hold: 1 })),
    { pig: 1, armR: 'up', look: 'down', eyes: 'half', mouth: 'grim', armL: 'half', fcy: 21, hold: 7 },
    // and it rolls away along the floor, out of the picture, so the loop starts again with nothing to jump over
    ...[30, 31, 32, 33, 34].map(fcx => ({ pig: 1, armR: 'up', look: 'right', eyes: 'half', mouth: 'grim', armL: 'half', fcx, fcy: 21, hold: 2 })),
    { pig: 1, armR: 'up', look: 'right', eyes: 'half', mouth: 'grim', armL: 'half', hold: 5 },
  ] },
  mad: { label: 'Clawd is angry: over today\'s allowance', face: '(`o\')', fd: 0.22, frames: [0, 1, 2, 0, 1, 2].map((t, i) => ({ pal: { c: '#e2553f', k: '#b83a29', f: '#f08a74' }, eyes: 'angry', mouth: 'grim', steam: t, vein: 1, armL: i % 2 ? 'high' : 'up', armR: i % 2 ? 'up' : 'high', dy: t % 2 })) },
  sleepy: { label: 'Clawd is getting sleepy and yawns, wide awake: the 5-hour limit is nearly used', face: '(-_-)z', fd: 0.4, frames: [
    { eyes: 'open', z: 0 },
    { eyes: 'open', dy: 1, z: 1 },
    { eyes: 'open', mouth: 'o', armR: 'half' },
    { eyes: 'happy', mouth: 'yawn', armR: 'up', dy: -1, z: 1 },
    { eyes: 'happy', mouth: 'yawn', armR: 'up', dy: -1, z: 2 },
    { eyes: 'open', mouth: 'o', armR: 'half', dy: 1 },
    { eyes: 'open', dy: 1, z: 1, armL: 'half' },
    { eyes: 'half', dy: 1, armL: 'up', mouth: 'flat', z: 2 },
    { eyes: 'half', dy: 1, armL: 'up', mouth: 'flat' },
    { eyes: 'open', armL: 'half', z: 0 },
  ] },
  asleep: { label: 'Clawd is asleep, collapsed on the alarm clock that is set beneath him: the 5-hour limit is reached', face: '(-.-)zZ', fd: 0.5, frames: range(4).map(t => ({ lift: 3, noLegs: 1, dy: [0, 1, 2, 1][t], mask: 1, clock: '00:00', zzz: t })) },
  love: { label: 'Clawd hugs himself: the handoff is saved', face: '(^_^)<3', fd: 0.3, frames: range(6).map(t => ({ eyes: 'happy', mouth: 'smile', armL: 'cross', armR: 'cross', heart: t % 4 })) },
  detective: { label: 'Clawd the detective found something in the repo', face: '(o_o)?!', fd: 0.5, frames: [0, -2, -4, -6, -8, -8, -6, -4, -2, 0].map((mgx, i) => ({ hat: 'fedora', eyes: 'half', look: 'right', magnifier: 1, armR: 'up', mouth: 'flat', bang: 1, bangX: OX + 1, ...(mgx !== 0 ? { mgx } : {}), ...(i === 4 || i === 5 ? { mgy: 1 } : {}), ...(i >= 2 && i <= 7 ? { brow: 'furrow' } : {}), ...(i === 7 || i === 9 ? { armL: 'half' } : i === 8 ? { armL: 'up' } : {}) })) },
  oops: { label: 'Clawd says oops: a tool failed', face: '(x_x)!', fd: 0.35, frames: [
    { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 },
    { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, dy: 1 },
    { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, armL: 'up', armR: 'up' },
    { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21, armL: 'up', armR: 'up', dy: 1 },
    { eyes: 'x', mouth: 'grim', bang: 1, bangX: OX + 21, armL: 'half', armR: 'half' },
  ] },
  wand: { label: 'Clawd the wizard enhanced your draft', face: '(^_^)*', fd: 0.4, frames: [
    { hat: 'wizard', wand: 1, eyes: 'happy', mouth: 'smile', armR: 'up' },
    { hat: 'wizard', wand: 1, eyes: 'open', mouth: 'smile', armR: 'up', star: 1, armL: 'half' },
    { hat: 'wizard', wand: 1, eyes: 'happy', mouth: 'smile', armR: 'up', star: 1, armL: 'up' },
    { hat: 'wizard', wand: 1, eyes: 'open', mouth: 'smile', armR: 'up', armL: 'half' },
  ] },
  hello: { label: 'Clawd waves hello', face: '(^_^)/', fd: 0.3, frames: [
    { armR: 'high', mouth: 'smile', eyes: 'happy' },
    { armR: 'up', mouth: 'smile', eyes: 'open' },
    { armR: 'high', armL: 'half', mouth: 'smile', eyes: 'happy' },
    { armR: 'up', armL: 'half', mouth: 'smile', eyes: 'open' },
  ] },
  idea: { label: 'Clawd has an idea: the plan was approved', face: '(o_o)!', fd: 0.4, frames: [
    { bulb: 1, eyes: 'open', mouth: 'smile', armR: 'up' },
    { bulb: 2, eyes: 'happy', mouth: 'smile', armR: 'up' },
    { bulb: 1, eyes: 'open', mouth: 'smile', armR: 'up', armL: 'half' },
    { bulb: 2, eyes: 'happy', mouth: 'smile', armR: 'up', armL: 'up' },
    { bulb: 1, eyes: 'open', mouth: 'smile', armR: 'up', armL: 'up' },
    { bulb: 2, eyes: 'happy', mouth: 'smile', armR: 'up', armL: 'half' },
  ] },
  coffee: { label: 'Clawd drinks coffee: this turn is taking a while', face: '(-_-)c', fd: 0.5, frames: [
    { cup: 1, armR: 'hold', mouth: 'smile', eyes: 'open' },
    { cup: 2, armR: 'hold', mouth: 'smile', eyes: 'open' },
    { cup: 1, armR: 'hold', mouth: 'o', eyes: 'half', armL: 'half' },
    { cup: 2, armR: 'hold', mouth: 'o', eyes: 'half', armL: 'half' },
    { cup: 1, armR: 'hold', mouth: 'smile', eyes: 'happy' },
    { cup: 2, armR: 'hold', mouth: 'smile', eyes: 'happy' },
    { cup: 1, armR: 'hold', mouth: 'open', eyes: 'wide', dx: -1, lines: 'shake', lineT: 0, armL: 'half' },
    { cup: 2, armR: 'hold', mouth: 'open', eyes: 'wide', dx: 1, lines: 'shake', lineT: 1, armL: 'up' },
    { cup: 1, armR: 'hold', mouth: 'open', eyes: 'wide', dx: -1, lines: 'shake', lineT: 0, armL: 'up' },
    { cup: 2, armR: 'hold', mouth: 'smile', eyes: 'half', armL: 'half' },
  ] },
  reading: { label: 'Clawd is reading files, turning pages of a book, a stack of books beside him', face: '(o_o)=', fd: 0.5, frames: [
    { glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' },
    { glasses: 1, book: 1, stack: 1, look: 'down', eyes: 'blink', armL: 'hold', armR: 'hold' },
    { glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' },
    { glasses: 1, book: 2, stack: 1, look: 'down', armL: 'up', armR: 'hold' },
    { glasses: 1, book: 2, stack: 1, look: 'down', armL: 'up', armR: 'hold' },
    { glasses: 1, book: 3, stack: 1, look: 'down', armL: 'hold', armR: 'hold' },
    { glasses: 1, book: 3, stack: 1, look: 'down', armL: 'hold', armR: 'hold' },
    { glasses: 1, book: 3, stack: 1, look: 'down', armL: 'hold', armR: 'hold' },
  ] },
  creating: { label: 'Clawd, a moustache on, holds a color palette and a paintbrush and is painting a picture on an easel: Claude is writing a file', face: '(o_o)~', fd: 0.28, frames: [[0, 0], [1, 1], [1, 2], [2, 3], [3, 4], [3, 2]].map(([easel, brush]) => ({ stache: 1, palette: 1, easel, brush, armR: 'half', armL: 'half', look: 'right', eyes: 'open' })) },
  building: { label: 'Clawd is editing code with a hammer', face: '(>_<)T', fd: 0.2, frames: [
    { hat: 'hard', wrench: 1, armR: 'up', mouth: 'smile', eyes: 'open' },
    { hat: 'hard', wrench: 2, armR: 'up', mouth: 'smile', eyes: 'open' },
    { hat: 'hard', wrench: 2, armR: 'up', mouth: 'smile', eyes: 'open', armL: 'half' },
    { hat: 'hard', wrench: 1, armR: 'up', mouth: 'flat', eyes: 'half', armL: 'half', lines: 'hit', lineT: 1, lcol: 'y' },
    { hat: 'hard', wrench: 2, armR: 'up', mouth: 'smile', eyes: 'open', armL: 'half', lines: 'hit', lineT: 2, lcol: 'y' },
    { hat: 'hard', wrench: 2, armR: 'up', mouth: 'smile', eyes: 'open', lines: 'hit', lineT: 3, lcol: 'y' },
    { hat: 'hard', wrench: 2, armR: 'up', mouth: 'smile', eyes: 'open' },
    { hat: 'hard', wrench: 1, armR: 'up', mouth: 'smile', eyes: 'open' },
  ] },
  browse: { label: 'Clawd is searching the web', face: '(o_o)Q', fd: 0.5, frames: [
    { browser: 1, glass: 1, look: 'right' },
    { browser: 2, glass: 1, look: 'right', armL: 'half' },
    { browser: 1, glass: 1, look: 'right', armL: 'half' },
    { browser: 2, glass: 1, look: 'right', armL: 'type1' },
    { browser: 1, glass: 1, look: 'right', armL: 'type1' },
    { browser: 2, glass: 1, look: 'right', armL: 'half' },
    { browser: 1, glass: 1, look: 'right', armL: 'half' },
    { browser: 2, glass: 1, look: 'right' },
  ] },
  plug: { label: 'Clawd holds an unplugged cable: a connector is offline', face: '(;_;)~', fd: 0.4, frames: [0, 1, 0, 1, 0, 1].map((t, i) => ({ plug: t, eyes: 'open', mouth: 'grim', armL: 'half', armR: 'half', dy: t })) },
  dizzy: { label: 'Clawd is dizzy: the conversation is being compacted', face: '(@_@)', fd: 0.2, frames: [0, -1, 0, 1, 0, -1, 0, 1].map((dx, i) => ({ spiral: (i % 2) + 1, eyes: 'dizzy', dx, mouth: 'o', ...(i >= 1 && i <= 3 ? { armL: 'half', armR: 'out' } : i >= 4 ? { armL: 'out', armR: 'half' } : {}) })) },
  lab: { label: 'Clawd holds bubbling flasks: the tests passed', face: '(^_^)8', fd: 0.3, frames: [0, 1, 2, 3, 4, 5].map(t => ({ flask: (t % 3) + 1, mouth: 'smile', eyes: t % 3 === 1 ? 'happy' : 'open', ...(t === 1 || t === 2 || t === 5 ? { armL: 'half' } : t === 3 || t === 4 ? { armL: 'up' } : {}) })) },
  hand: { label: 'Clawd holds a clipboard and a pencil and raises a hand: Claude asked you a question and waits for your answer', face: '(o_o)[]!', fd: 0.2, frames: [[1, 1], [1, 2], [2, 3], [2, 2], [3, 1], [3, 2], [3, 3], [3, 2]].map(([clipboard, bangC], i) => ({ clipboard, look: 'down', mouth: 'flat', bangC, ...(i === 2 || i === 3 || i === 6 || i === 7 ? { armL: 'half' } : {}) })) },
  writing: { label: 'Clawd writes it down with a quill', face: '(o_o)~', fd: 0.4, frames: [1, 2, 3, 4, 4, 3].map((paper, i) => ({ glasses: 1, paper, look: 'down', mouth: 'flat', ...(i === 1 || i === 2 ? { armL: 'half' } : {}) })) },
  boom: { label: 'Clawd\'s flask swells, cracks and blows up in his face: the checks failed', face: '(x_x)*', fd: 0.1, leave: { soot: 1, frizz: 1, eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half' }, frames: [
    { beaker: 1, armR: 'up', eyes: 'open', look: 'right', mouth: 'flat', hold: 8 },
    { beaker: 2, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: -1, hold: 2 },
    { beaker: 2, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: 1, hold: 2 },
    { beaker: 2, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: -1, hold: 2 },
    { beaker: 3, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: 1, hold: 2 },
    { beaker: 3, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: -1, hold: 2 },
    { beaker: 3, armR: 'up', eyes: 'wide', look: 'right', mouth: 'o', dx: 1, hold: 2 },
    { burst: 1, armR: 'high', eyes: 'wide', mouth: 'o', hold: 1 },
    { burst: 2, armR: 'high', armL: 'half', eyes: 'x', mouth: 'o', dy: -1, hold: 1 },
    { burst: 3, armR: 'high', armL: 'up', eyes: 'x', mouth: 'o', dy: -2, dx: -1, hold: 2 },
    { burst: 4, soot: 1, frizz: 1, eyes: 'x', mouth: 'o', armR: 'up', armL: 'up', dy: -1, hold: 3 },
    { soot: 1, frizz: 1, puff: 1, eyes: 'dizzy', mouth: 'o', armL: 'half', armR: 'half', hold: 4 },
    { soot: 1, frizz: 1, puff: 2, eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half', dy: 1, hold: 4 },
    { soot: 1, frizz: 1, puff: 3, eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half', hold: 4 },
    { soot: 1, frizz: 1, eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half', hold: 26 },
  ] },
  ship: { label: 'Clawd presses the big red button and watches a rocket blast off: it shipped', face: '(^o^)^', fd: 0.1, frames: [
    { console: 0, rocket: 15, look: 'right', eyes: 'open', mouth: 'smile', hold: 5 },
    { console: 0, rocket: 15, look: 'down', eyes: 'open', mouth: 'smile', armL: 'half', hold: 2 },
    { console: 0, rocket: 15, look: 'down', eyes: 'open', mouth: 'smile', armL: 'type1', hold: 2 },
    { console: 1, rocket: 15, look: 'down', eyes: 'wide', mouth: 'smile', armL: 'type0', hold: 3 },
    { console: 1, rocket: 15, rocketDx: 1, thrust: 1, smokeP: 1, look: 'right', eyes: 'wide', mouth: 'smile', armL: 'type1', hold: 2 },
    { console: 1, rocket: 15, rocketDx: -1, thrust: 2, smokeP: 2, look: 'right', eyes: 'wide', mouth: 'smile', armL: 'half', dx: -1, hold: 2 },
    { console: 1, rocket: 15, rocketDx: 1, thrust: 2, smokeP: 2, look: 'right', eyes: 'wide', mouth: 'smile', armL: 'half', dx: 1, hold: 2 },
    // lift-off: the rocket speeds up (1 pixel a tick, then 2, 3, 4) until it is out of the canvas, and he follows it with his eyes and his arms
    ...[14, 13, 12, 10, 8, 6, 3, 0, -3, -6, -10, -14, -18, -22].map((rocket, i) => ({ console: 1, rocket, thrust: 3, smokeP: i < 5 ? 3 : 4, look: i < 3 ? 'right' : 'up', eyes: i < 3 ? 'wide' : i < 7 ? 'open' : 'happy', mouth: 'smile', armL: i < 3 ? 'half' : i < 6 ? 'up' : 'high', armR: i < 3 ? 'rest' : i < 6 ? 'half' : i < 9 ? 'up' : 'high', ...(i >= 6 && i < 12 ? { dy: -1 } : {}), hold: 1 })),
    { console: 1, smokeP: 4, look: 'up', eyes: 'happy', mouth: 'smile', armL: 'up', armR: 'up', hold: 2 },
    { console: 1, smokeP: 3, look: 'up', eyes: 'happy', mouth: 'smile', armL: 'half', armR: 'half', hold: 2 },
    { console: 0, smokeP: 2, look: 'right', eyes: 'open', mouth: 'smile', hold: 2 },
    { console: 0, smokeP: 1, look: 'right', eyes: 'open', mouth: 'smile', hold: 2 },
    { console: 0, rocket: 26, look: 'right', eyes: 'open', mouth: 'smile', hold: 1 },
    { console: 0, rocket: 23, look: 'right', eyes: 'open', mouth: 'smile', hold: 1 },
    { console: 0, rocket: 20, look: 'right', eyes: 'open', mouth: 'smile', hold: 1 },
    { console: 0, rocket: 17, look: 'right', eyes: 'open', mouth: 'smile', hold: 1 },
    { console: 0, rocket: 15, look: 'right', eyes: 'open', mouth: 'smile', hold: 14 },
  ] },
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
  running: { dy: [0, -1, 0, -1] }, // the same
  thinking: { dx: [0, 0, 1, 1, 0, 0, -1, -1] }, // sways while the spinner turns
  coins: { each: 2, dy: [0, -2, 0, -1] }, // hops over the coins
  talk: { each: 2, dy: [0, -1, 0, 0, 0, -1, 0, 0] }, // nods as he talks
  fire: { dy: [0, -1, 0, -1], dx: [0, 1, -1, 0] }, // panics on the spot
  hourglass: { dx: [0, -1, 0, 0] }, // fidgets, waiting (props at the right edge: left only)
  cold: { each: 2, dx: [0, 1, 1, 0, 0, -1, -1, 0] }, // a slight shiver
  mad: { each: 2, dy: [0, -1, 0, -1, 0, -1], dx: [0, 1, -1, 1, -1, 0] }, // stomps
  love: { dx: [0, 1, 1, 0, -1, -1] }, // sways in the hug
  detective: { each: 2, dx: [0, -1, -2, -1] }, // creeps along
  oops: { each: 2, dx: [0, 2, 0, -2] }, // shakes
  wand: { each: 2, dy: [0, -1, 0, 0] }, // flourish
  hello: { each: 2, dy: [0, -1, 0, -1] }, // bounces while he waves
  idea: { each: 2, dy: [0, -2, 0, 0] }, // eureka hop
  coffee: { each: 2, dy: [0, 0, 1, 0] }, // sips
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
const LAPTOP: Pose = { laptop: 1, look: 'down', eyes: 'half', mouth: 'focus', armL: 'type1', armR: 'type0' }
const SUN: Pose = { shades: 1, mouth: 'smile' }
/** The first pose of a state: where a move into it ends and a move out of it begins, so there is no seam. */
const unheld = (p: Pose): Pose => {
  const { hold: _hold, ...rest } = p
  return rest
}
const F = (id: StateId): Pose => unheld(STATES[id].frames[0] ?? {})
/** Where a move OUT of a state starts: the pose its loop ends in when that is not its first frame. */
const L = (id: StateId): Pose => unheld(STATES[id].leave ?? STATES[id].frames[0] ?? {})
const BARE: Pose = { eyes: 'blink', mouth: 'smile' }
const READY: Pose = { eyes: 'happy', mouth: 'open', armR: 'high', bell: 0, notes: 0 }
const MUSE: Pose = { spinner: 0, look: 'up', armR: 'chin' }
/** After the blast he wipes the soot off with his left hand. */
const WIPE: Pose = { soot: 1, frizz: 1, eyes: 'half', mouth: 'grim', armL: 'up', armR: 'half' }
const OOPS: Pose = { eyes: 'x', mouth: 'o', bang: 1, bangX: OX + 21 }
const HAT: Pose = { hat: 'hard', wrench: 1, armR: 'up', mouth: 'smile', eyes: 'open' }
const READ: Pose = { glasses: 1, book: 1, stack: 1, look: 'down', armL: 'hold', armR: 'hold' }
export const MOVES: Partial<Record<string, Move>> = {
  // Shipping (a rocket and a big red button) and the blast (a flask that explodes): after the work and before the bell, or back to it.
  'typing>ship': { fd: 0.18, frames: [F('typing'), { look: 'right', eyes: 'open', mouth: 'smile' }, F('ship')] },
  'ship>typing': { fd: 0.18, frames: [L('ship'), { look: 'down', eyes: 'half', mouth: 'smile' }, F('typing')] },
  'building>ship': { fd: 0.18, frames: [F('building'), { hat: 'hard', look: 'right', eyes: 'open', armR: 'half' }, { look: 'right', eyes: 'open', mouth: 'smile' }, F('ship')] },
  'ship>building': { fd: 0.18, frames: [L('ship'), { look: 'down', eyes: 'open', mouth: 'smile' }, { hat: 'hard', look: 'down', armR: 'half' }, F('building')] },
  'thinking>ship': { fd: 0.16, frames: [F('thinking'), { look: 'right', eyes: 'wide', armR: 'up', mouth: 'open' }, F('ship')] },
  'ship>thinking': { fd: 0.16, frames: [L('ship'), { eyes: 'open', look: 'up', mouth: 'smile' }, F('thinking')] },
  'lab>ship': { fd: 0.16, frames: [F('lab'), { eyes: 'happy', mouth: 'smile', armR: 'up' }, F('ship')] },
  'ship>lab': { fd: 0.16, frames: [L('ship'), { eyes: 'happy', mouth: 'smile', armR: 'up' }, F('lab')] },
  'ship>bell': { fd: 0.16, frames: [L('ship'), { eyes: 'happy', mouth: 'smile', look: 'right', armL: 'up' }, { ...READY }, F('bell')] },
  'bell>ship': { fd: 0.16, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { eyes: 'open', mouth: 'smile', look: 'right' }, F('ship')] },
  'ship>idle': { fd: 0.16, frames: [L('ship'), { eyes: 'happy', mouth: 'smile', armL: 'half' }, F('idle')] },
  'idle>ship': { fd: 0.16, frames: [F('idle'), { eyes: 'open', mouth: 'smile' }, F('ship')] },
  'typing>boom': { fd: 0.18, frames: [F('typing'), { laptop: 1, eyes: 'wide', mouth: 'o', look: 'down', armL: 'type1', armR: 'type0' }, { eyes: 'wide', mouth: 'o', armR: 'up' }, F('boom')] },
  'boom>typing': { fd: 0.18, frames: [L('boom'), { ...WIPE }, { look: 'down', eyes: 'half', mouth: 'flat' }, F('typing')] },
  'building>boom': { fd: 0.18, frames: [F('building'), { hat: 'hard', eyes: 'wide', mouth: 'o', armR: 'high' }, { eyes: 'wide', mouth: 'o', armR: 'up' }, F('boom')] },
  'boom>building': { fd: 0.18, frames: [L('boom'), { ...WIPE }, { hat: 'hard', look: 'down', armR: 'half' }, F('building')] },
  'thinking>boom': { fd: 0.16, frames: [F('thinking'), { eyes: 'wide', mouth: 'o', armR: 'up', look: 'right' }, F('boom')] },
  'boom>thinking': { fd: 0.16, frames: [L('boom'), { ...WIPE }, F('thinking')] },
  'reading>boom': { fd: 0.16, frames: [F('reading'), { glasses: 1, look: 'down', eyes: 'wide', mouth: 'o' }, { eyes: 'wide', mouth: 'o', armR: 'up' }, F('boom')] },
  'boom>reading': { fd: 0.16, frames: [L('boom'), { ...WIPE }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  'boom>bell': { fd: 0.16, frames: [L('boom'), { ...WIPE }, { eyes: 'half', mouth: 'smile', armR: 'half' }, { ...READY }, F('bell')] },
  'boom>idle': { fd: 0.16, frames: [L('boom'), { ...WIPE }, { eyes: 'half', mouth: 'smile' }, F('idle')] },
  'idle>boom': { fd: 0.16, frames: [F('idle'), { eyes: 'wide', mouth: 'o' }, F('boom')] },
  // The turn ends and a status alert takes over: he lets go of the bell and slides into the alert.
  'bell>fire': { fd: 0.14, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { eyes: 'wide', mouth: 'o', armR: 'up' }, { eyes: 'wide', mouth: 'o', armL: 'half', armR: 'half', forehead: 0 }, F('fire')] },
  'bell>mad': { fd: 0.14, frames: [F('bell'), { eyes: 'half', mouth: 'flat', armR: 'half' }, { eyes: 'angry', mouth: 'grim', armL: 'up', armR: 'up' }, F('mad')] },
  'bell>gauge': { fd: 0.14, frames: [F('bell'), { eyes: 'open', look: 'left', mouth: 'smile', armR: 'half' }, { eyes: 'open', look: 'right', mouth: 'smile', armR: 'up' }, F('gauge')] },
  'bell>hourglass': { fd: 0.14, frames: [F('bell'), { eyes: 'open', look: 'right', mouth: 'smile', armR: 'half' }, { eyes: 'open', look: 'right', mouth: 'flat', armR: 'up' }, F('hourglass')] },
  'bell>sleepy': { fd: 0.14, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { eyes: 'half', mouth: 'o', armR: 'half' }, F('sleepy')] },
  'bell>drunk': { fd: 0.14, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { eyes: 'half', mouth: 'o', blush: 1 }, F('drunk')] },
  'bell>coins': { fd: 0.14, frames: [F('bell'), { eyes: 'happy', mouth: 'open', armR: 'half' }, { eyes: 'wide', mouth: 'o', armR: 'half' }, F('coins')] },
  'coins>idle': { fd: 0.14, frames: [F('coins'), { eyes: 'happy', mouth: 'smile', armL: 'half' }, F('idle')] },
  'coins>bell': { fd: 0.14, frames: [F('coins'), { eyes: 'happy', mouth: 'smile', armL: 'half' }, { ...READY }, F('bell')] },
  // A plan was approved: the idea, then straight to the work.
  'hand>idea': { fd: 0.14, frames: [F('hand'), { ...BARE, look: 'up' }, { eyes: 'wide', mouth: 'o', armR: 'up' }, F('idea')] },
  'idea>typing': { fd: 0.14, frames: [F('idea'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { look: 'down', eyes: 'half', armR: 'half' }, { ...LAPTOP }] },
  'idea>building': { fd: 0.14, frames: [F('idea'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { hat: 'hard', look: 'down', armR: 'up', mouth: 'smile', eyes: 'open' }, F('building')] },
  'idea>thinking': { fd: 0.14, frames: [F('idea'), { eyes: 'open', look: 'up', mouth: 'smile', armR: 'half' }, F('thinking')] },
  'hand>reading': { fd: 0.14, frames: [F('hand'), { ...BARE, look: 'down' }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  'hand>browse': { fd: 0.14, frames: [F('hand'), { ...BARE, look: 'right' }, { look: 'right', eyes: 'open', glass: 1 }, F('browse')] },
  // Work moves from one kind of tool to the next.
  'browse>reading': { fd: 0.14, frames: [F('browse'), { look: 'right', eyes: 'open', glass: 1 }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  'reading>browse': { fd: 0.14, frames: [F('reading'), { glasses: 1, look: 'right', eyes: 'half' }, { look: 'right', eyes: 'open', glass: 1 }, F('browse')] },
  'browse>building': { fd: 0.14, frames: [F('browse'), { look: 'right', eyes: 'open', glass: 1 }, { hat: 'hard', look: 'down', armR: 'half' }, F('building')] },
  'building>browse': { fd: 0.14, frames: [F('building'), { hat: 'hard', look: 'right', armR: 'half' }, { look: 'right', eyes: 'open', glass: 1 }, F('browse')] },
  'browse>thinking': { fd: 0.14, frames: [F('browse'), { look: 'right', eyes: 'open', glass: 1 }, { look: 'up', eyes: 'open' }, F('thinking')] },
  'building>thinking': { fd: 0.14, frames: [F('building'), { hat: 'hard', look: 'down', armR: 'half' }, { look: 'up', eyes: 'open', armR: 'up' }, F('thinking')] },
  'reading>thinking': { fd: 0.14, frames: [F('reading'), { glasses: 1, look: 'up', eyes: 'half' }, { look: 'up', eyes: 'open', armR: 'up' }, F('thinking')] },
  'thinking>dizzy': { fd: 0.14, frames: [F('thinking'), { look: 'up', eyes: 'wide', mouth: 'o', armR: 'up' }, F('dizzy')] },
  'dizzy>thinking': { fd: 0.14, frames: [F('dizzy'), { eyes: 'half', mouth: 'o' }, F('thinking')] },
  'lab>building': { fd: 0.14, frames: [F('lab'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { hat: 'hard', look: 'down', armR: 'half' }, F('building')] },
  'oops>building': { fd: 0.14, frames: [F('oops'), { eyes: 'half', mouth: 'flat', look: 'down' }, { hat: 'hard', look: 'down', armR: 'half' }, F('building')] },
  'oops>reading': { fd: 0.14, frames: [F('oops'), { eyes: 'half', mouth: 'flat', look: 'down' }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  'coffee>thinking': { fd: 0.14, frames: [F('coffee'), { eyes: 'open', mouth: 'smile', armR: 'half' }, { look: 'up', eyes: 'open' }, F('thinking')] },
  'coffee>building': { fd: 0.14, frames: [F('coffee'), { eyes: 'open', mouth: 'smile', armR: 'half' }, { hat: 'hard', look: 'down', armR: 'up' }, F('building')] },
  'coffee>reading': { fd: 0.14, frames: [F('coffee'), { eyes: 'half', mouth: 'smile', armR: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  'coffee>browse': { fd: 0.14, frames: [F('coffee'), { eyes: 'open', mouth: 'smile', armR: 'half' }, { look: 'right', eyes: 'open', glass: 1 }, F('browse')] },
  // From reading to painting: the book and the glasses are put away, the moustache goes on, the palette and the brush are fetched; and back.
  'reading>creating': { fd: 0.14, frames: [F('reading'), { glasses: 1, look: 'down', eyes: 'half' }, { look: 'down', eyes: 'open', mouth: 'smile' }, { stache: 1, look: 'right', eyes: 'open', mouth: 'smile' }, { stache: 1, palette: 1, look: 'right', eyes: 'open', armL: 'half', armR: 'half' }, F('creating')] },
  'creating>reading': { fd: 0.14, frames: [F('creating'), { stache: 1, palette: 1, brush: 0, look: 'down', eyes: 'open', armL: 'half', armR: 'half' }, { stache: 1, look: 'down', eyes: 'open', mouth: 'smile' }, { look: 'down', eyes: 'half', mouth: 'smile' }, { glasses: 1, look: 'down', eyes: 'half' }, F('reading')] },
  // The painter and the other kinds of work: the brush and the palette are put away (or fetched) by hand, the moustache is the last to go.
  'creating>building': { fd: 0.2, frames: [F('creating'), { stache: 1, palette: 1, brush: 0, look: 'down', eyes: 'open', armL: 'half', armR: 'half' }, { stache: 1, look: 'down', eyes: 'open', mouth: 'smile' }, { ...HAT }] },
  'building>creating': { fd: 0.2, frames: [{ ...HAT }, { hat: 'hard', look: 'down', armR: 'half' }, { look: 'right', eyes: 'open', mouth: 'smile' }, { stache: 1, palette: 1, brush: 0, look: 'right', eyes: 'open', armL: 'half', armR: 'half' }, F('creating')] },
  'creating>typing': { fd: 0.18, frames: [F('creating'), { stache: 1, palette: 1, brush: 0, look: 'down', eyes: 'open', armL: 'half', armR: 'half' }, { look: 'down', eyes: 'half', mouth: 'focus' }, { ...LAPTOP }] },
  'typing>creating': { fd: 0.18, frames: [{ ...LAPTOP }, { look: 'down', eyes: 'half', mouth: 'focus' }, { stache: 1, palette: 1, brush: 0, look: 'right', eyes: 'open', armL: 'half', armR: 'half' }, F('creating')] },
  // Done and the detective: the bell is put away, the fedora and the magnifier are fetched by hand (and the other way round).
  'bell>detective': { fd: 0.16, frames: [F('bell'), { eyes: 'happy', mouth: 'smile', armR: 'half' }, { eyes: 'open', mouth: 'flat', look: 'right' }, { hat: 'fedora', eyes: 'half', look: 'right', armR: 'up', mouth: 'flat' }, F('detective')] },
  'detective>bell': { fd: 0.16, frames: [F('detective'), { hat: 'fedora', eyes: 'half', look: 'right', armR: 'up', mouth: 'flat' }, { eyes: 'open', look: 'right', mouth: 'smile', armR: 'half' }, { eyes: 'happy', mouth: 'open', armR: 'high' }, F('bell')] },
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

/** The launch console and the rocket sink out of the canvas when he leaves the scene, and rise into it when he comes (nothing pops). */
const SHIP_OUT: Pose[] = [
  { console: 0, rocket: 19, look: 'right', eyes: 'open', mouth: 'smile' },
  { console: 0, consoleDy: 2, rocket: 24, look: 'right', eyes: 'open', mouth: 'smile' },
  { console: 0, consoleDy: 5, rocket: 28, look: 'right', eyes: 'open', mouth: 'smile' },
]
const SHIP_IN: Pose[] = [...SHIP_OUT].reverse()
// Fishing: the hat and the rod are fetched (or put away) one at a time by hand, so a move is his first frame, a bare pose, the hat, and his.
for (const x of ['typing', 'thinking', 'idle', 'bell', 'hand', 'coffee', 'building', 'reading'] as StateId[]) {
  MOVES[`${x}>fishing`] = { fd: 0.16, frames: [F(x), { look: 'right', eyes: 'open', mouth: 'smile' }, { hat: 'fisher', look: 'right', eyes: 'open', mouth: 'smile' }, F('fishing')] }
  MOVES[`fishing>${x}`] = { fd: 0.16, frames: [L('fishing'), { hat: 'fisher', look: 'down', eyes: 'half', mouth: 'smile' }, { look: 'down', eyes: 'half', mouth: 'smile' }, F(x)] }
}
// Running goes wherever typing goes: every hand-drawn move of typing is copied for running, with his own first (or last) frame, the one with the code.
for (const key of Object.keys(MOVES)) {
  const [from, to] = key.split('>')
  const m = MOVES[key]!
  if (from === 'typing') MOVES[`running>${to}`] = { ...m, frames: [F('running'), ...m.frames.slice(1)] }
  if (to === 'typing') MOVES[`${from}>running`] = { ...m, frames: [...m.frames.slice(0, -1), F('running')] }
}
/** Typing and running differ only in the code behind him: he keeps tapping and the lines fade in (or out) a few at a time (see fadeCode). */
const TAP = (i: number): Pose => ({ ...T, mouth: 'focus', armL: i % 2 ? 'type0' : 'type1', armR: i % 2 ? 'type1' : 'type0', dy: i % 2 ? -1 : 0 })
MOVES['typing>running'] = { fd: 0.14, frames: [F('typing'), TAP(1), TAP(2), TAP(3), TAP(4), TAP(5), F('running')] }
MOVES['running>typing'] = { fd: 0.14, frames: [F('running'), TAP(1), TAP(2), TAP(3), TAP(4), TAP(5), F('typing')] }
for (const key of Object.keys(MOVES)) {
  const [from, to] = key.split('>')
  const m = MOVES[key]!
  const f = m.frames
  if (from === 'ship') MOVES[key] = { ...m, frames: [f[0]!, ...SHIP_OUT, ...f.slice(1)] }
  if (to === 'ship') MOVES[key] = { ...m, frames: [...f.slice(0, -1), ...SHIP_IN, f[f.length - 1]!] }
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
const HELD = ['rod', 'magnifier', 'brush', 'palette', 'shades', 'hat', 'glasses', 'laptop', 'book', 'stack', 'scroll', 'clipboard', 'cup', 'flask', 'glass', 'browser', 'bell', 'wrench', 'paper', 'bulb', 'wand', 'beaker']
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
 * fetched the other way: the arm swings out, brings it up, and it goes on. One hand takes a thing off and the other
 * puts the next on (head and two-handed things leave with the left hand, the rest with the right). The frames on
 * either side are untouched, so a move still meets its neighbours.
 */
/** Worn on the head or held in two hands: taken away with the left hand. Everything else is in the right one. */
const LEFT_FIRST = ['shades', 'glasses', 'hat', 'laptop', 'book', 'stack', 'scroll', 'palette', 'paper']
const takenBy = (k: string): 'L' | 'R' => (LEFT_FIRST.includes(k) ? 'L' : 'R')
/** A prop's pose while it is in a hand: the arm that holds it, and which side the small drawing goes. */
const inHand = (hand: 'L' | 'R', k: string, at: 1 | 3): Pose => ({ [hand === 'L' ? 'armL' : 'armR']: at === 1 ? 'up' : 'out', carry: k, at, carrySide: hand })
const handUp = (hand: 'L' | 'R'): Pose => ({ [hand === 'L' ? 'armL' : 'armR']: 'up' })

function stage(frames: Pose[]): Pose[] {
  const out: Pose[] = []
  frames.forEach((g, i) => {
    const f = frames[i - 1]
    if (f) {
      // Present means defined: the bell's rest position is 0, which is still a bell.
      const gone = HELD.filter(k => f[k] !== undefined && g[k] === undefined)
      const came = HELD.filter(k => f[k] === undefined && g[k] !== undefined)
      let cur = f
      let off: 'L' | 'R' | null = null
      if (gone.length) {
        const k = carried(gone[0]!, f)
        off = takenBy(gone[0]!)
        out.push({ ...cur, ...handUp(off) })
        out.push({ ...without(cur, gone), ...inHand(off, k, 1) })
        out.push({ ...without(cur, gone), ...inHand(off, k, 3) })
        cur = without(cur, gone)
      }
      if (came.length) {
        const k = carried(came[0]!, g)
        // One hand takes a thing off and the other puts the next one on.
        const on: 'L' | 'R' = off ? (off === 'L' ? 'R' : 'L') : 'R'
        out.push({ ...cur, ...inHand(on, k, 3) })
        out.push({ ...cur, ...inHand(on, k, 1) })
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
const ARM_LADDER = ['rest', 'half', 'up', 'high']
const armStep = (k: unknown): number => (k === undefined ? 0 : ARM_LADDER.indexOf(String(k)))
/**
 * A hand does not jump from his side to over his head: between two frames whose arm is two or more steps apart on the
 * ladder (rest, half, up, high), the steps in between are drawn, so an arm travels instead of teleporting.
 */
function inbetween(frames: Pose[]): Pose[] {
  const out: Pose[] = []
  frames.forEach((g, i) => {
    const f = frames[i - 1]
    if (f) {
      const gap = (side: 'armL' | 'armR') => {
        const a = armStep(f[side]), b = armStep(g[side])
        return a >= 0 && b >= 0 ? b - a : 0
      }
      const steps = Math.max(Math.abs(gap('armL')), Math.abs(gap('armR'))) - 1
      for (let n = 1; n <= steps; n++) {
        const mid: Pose = { ...f }
        for (const side of ['armL', 'armR'] as const) {
          const a = armStep(f[side]), d = gap(side)
          if (Math.abs(d) > n) mid[side] = ARM_LADDER[a + Math.sign(d) * n]
          else if (d !== 0) mid[side] = g[side]
        }
        out.push(mid)
      }
    }
    out.push(g)
  })
  return out
}

function smooth(frames: Pose[]): Pose[] {
  const staged = inbetween(stage(frames))
  const n = staged.length
  if (n < 3) return staged
  const mid = Math.floor((n - 1) / 2)
  return staged.map((f, i) => {
    if (i === 0) return { ...f, hold: 0.6 }
    if (i === n - 1) return { ...f, hold: 1.3 }
    const out: Pose = { ...f }
    if (i === mid && (out.eyes === undefined || out.eyes === 'open' || out.eyes === 'half')) out.eyes = 'blink'
    // One small hop in the middle of the move (overhead props, a spinner or a spiral, would leave the top of the canvas).
    if (out.dy === undefined && i === mid && pixelsOutside([{ ...out, dy: -1 }], 34) === 0) out.dy = -1
    return out
  })
}

/** Slow enough to see (a frame is at least MOVE_FD), but never longer than MOVE_MAX_S in all; leaving the raised hand is quick. */
const MOVE_FD = 0.11
const MOVE_MAX_S = 1.5
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
 * How each state begins: one or two poses between his neutral self and the state's first frame (what he does as it
 * takes hold). A morph between two states with no hand-drawn move plays the way out of the first, then the way in
 * to the second, so every pair has a move with some character and the hand-drawn ones are only the special cases.
 */
const ENTER: Partial<Record<StateId, Pose[]>> = {
  typing: [{ look: 'down', eyes: 'half', mouth: 'focus' }],
  fishing: [{ look: 'right', eyes: 'open', mouth: 'smile' }],
  running: [{ look: 'down', eyes: 'half', mouth: 'focus' }],
  thinking: [{ eyes: 'wide', armR: 'up', mouth: 'open' }],
  bell: [{ eyes: 'happy', mouth: 'smile', armR: 'half' }],
  coins: [{ eyes: 'wide', mouth: 'o', armR: 'half' }],
  talk: [{ eyes: 'open', mouth: 'open', armR: 'half' }],
  drunk: [{ eyes: 'half', mouth: 'o', blush: 1 }],
  fire: [{ eyes: 'wide', mouth: 'o', armL: 'half', armR: 'half' }, { eyes: 'wide', mouth: 'o', armL: 'high', armR: 'half' }],
  hourglass: [{ eyes: 'open', look: 'right', mouth: 'flat' }],
  gauge: [{ eyes: 'open', look: 'right', mouth: 'smile', armR: 'up' }],
  mad: [{ eyes: 'angry', mouth: 'grim' }, { eyes: 'angry', mouth: 'grim', armL: 'up', armR: 'up' }],
  sleepy: [{ eyes: 'open', mouth: 'o', armR: 'half' }],
  love: [{ eyes: 'happy', mouth: 'smile', armL: 'half', armR: 'half' }],
  detective: [{ eyes: 'half', look: 'right', mouth: 'flat' }],
  oops: [{ eyes: 'wide', mouth: 'o', armL: 'high', armR: 'high' }],
  wand: [{ eyes: 'wide', mouth: 'o' }],
  hello: [{ eyes: 'happy', mouth: 'smile', armR: 'up' }],
  idea: [{ eyes: 'wide', mouth: 'o', armR: 'up' }],
  coffee: [{ eyes: 'half', mouth: 'smile', armR: 'half' }],
  building: [{ look: 'down', eyes: 'open', mouth: 'smile', armR: 'half' }],
  browse: [{ look: 'right', eyes: 'open', mouth: 'flat' }],
  plug: [{ mouth: 'grim' }],
  dizzy: [{ eyes: 'dizzy', mouth: 'o' }],
  lab: [{ eyes: 'happy', mouth: 'smile', armR: 'up' }],
  hand: [{ look: 'down', mouth: 'flat' }],
  writing: [{ look: 'down', mouth: 'flat' }],
  creating: [{ look: 'right', eyes: 'open', mouth: 'smile' }],
  boom: [{ eyes: 'wide', mouth: 'o' }],
  ship: [{ eyes: 'open', look: 'right', mouth: 'smile' }],
}
const leaving = (id: StateId): Pose[] => [...(ENTER[id] ?? [])].reverse()

/**
 * The move between two states: the hand-drawn one when there is one, otherwise a morph. The morph drops what
 * he holds (a bare, blinking Clawd) and picks up the next thing, which works for any pair because every state
 * starts from the same neutral pose. Null only when nothing changes.
 */
function moveOf(from: StateId, to: StateId, phase = 0): (Move & { w: number }) | null {
  const m = rawMoveOf(from, to, phase)
  return m ? { ...m, frames: fadeCode(m.frames, from, to) } : null
}

/**
 * Fishing, while a background task runs and Claude is not: a long loop, so he does not check the line too often. He puts a worm on
 * the hook, swings the rod back, casts, waits a long time (the bobber bobs on a thin ripple, he yawns, a nibble that comes to nothing),
 * reels in, looks at the hook, finds the worm gone, shrugs, and starts again with a new worm. The water is only a thin ripple where
 * the line goes in. Positions: his grip is at (27, 14); a rod is its tip, a line is where it ends.
 */
function fishingLoop(): Pose[] {
  const base: Pose = { hat: 'fisher', armR: 'hold', mouth: 'smile', eyes: 'open' }
  const ACROSS: [number, number] = [18, 16]
  const WAIT: [number, number] = [31, 10]
  const f = (p: Pose, hold = 1): Pose => ({ ...base, ...p, hold })
  const out: Pose[] = []
  const add = (p: Pose, hold = 1) => out.push(f(p, hold))
  // ---- a worm on the hook: the rod lies across his belly, the hook hangs between his legs, his left hand brings the worm
  const bait = { rod: ACROSS, line: [18, 18] as [number, number], hook: [18, 19] as [number, number] }
  add({ ...bait, look: 'down', eyes: 'half', mouth: 'flat', armL: 'half' }, 4)
  add({ ...bait, look: 'down', eyes: 'half', armL: 'half', wormAt: [4, 16, 0] }, 2)
  add({ ...bait, look: 'down', eyes: 'half', armL: 'half', wormAt: [4, 16, 1] }, 2)
  add({ ...bait, look: 'down', eyes: 'half', armL: 'cross', wormAt: [14, 17, 0] }, 2)
  add({ ...bait, look: 'down', eyes: 'half', armL: 'cross', wormAt: [16, 21, 1] }, 2)
  add({ ...bait, look: 'down', eyes: 'half', armL: 'half', worm: 2 }, 2)
  add({ ...bait, look: 'down', eyes: 'happy', armL: 'half', worm: 3 }, 4)
  // ---- the swing back and the cast
  add({ rod: [25, 3], line: [25, 8], hook: [25, 9], worm: 2, look: 'up', eyes: 'open' }, 2)
  add({ rod: [22, 2], line: [20, 6], hook: [20, 7], worm: 3, look: 'up', eyes: 'wide', mouth: 'flat' }, 3)
  add({ rod: [32, 9], line: [32, 13], hook: [32, 14], worm: 2, look: 'right', eyes: 'wide', mouth: 'open' }, 1)
  add({ rod: [32, 9], bobber: [31, 14], line: [32, 13], hook: [32, 19], worm: 3, look: 'right', eyes: 'open' }, 1)
  add({ rod: WAIT, bobber: [30, 18], line: [31, 17], hook: [31, 23], worm: 2, look: 'right', eyes: 'open', water: [30, 21, 0], splash: 1 }, 1)
  add({ rod: WAIT, bobber: [30, 19], line: [31, 18], hook: [31, 23], worm: 3, look: 'right', eyes: 'open', water: [30, 21, 1], splash: 2 }, 1)
  // ---- the wait: the bobber bobs on the ripple, he watches it, yawns, looks about, blinks
  const wait = (ph: number, bob: number, p: Pose = {}, hold = 3) => add({ rod: WAIT, bobber: [30, 19 + bob], line: [31, 18 + bob], hook: [31, 23], worm: ph % 2 ? 2 : 3, look: 'right', eyes: 'half', water: [30, 21, ph % 4], ...p }, hold)
  for (let i = 0; i < 4; i++) wait(i, i % 2, { mouth: 'smile' }, 4)
  wait(0, 0, { eyes: 'blink' }, 1)
  for (let i = 0; i < 3; i++) wait(i + 1, i % 2, { mouth: 'smile' }, 4)
  wait(0, 0, { mouth: 'o', eyes: 'blink', armL: 'half' }, 3) // a yawn
  wait(1, 1, { mouth: 'o', eyes: 'blink', armL: 'up' }, 3)
  wait(2, 0, { mouth: 'o', eyes: 'blink', armL: 'half' }, 3)
  for (let i = 0; i < 3; i++) wait(i, i % 2, { look: 'down', mouth: 'smile' }, 4)
  // a nibble: the bobber dips, he leans in, and it comes to nothing
  add({ rod: WAIT, bobber: [30, 20], line: [31, 19], hook: [31, 23], worm: 2, look: 'right', eyes: 'wide', mouth: 'o', water: [30, 21, 2], splash: 3 }, 2)
  add({ rod: WAIT, bobber: [30, 21], line: [31, 20], hook: [31, 24], worm: 3, look: 'right', eyes: 'wide', mouth: 'o', water: [30, 21, 3], splash: 1 }, 2)
  add({ rod: WAIT, bobber: [30, 19], line: [31, 18], hook: [31, 23], worm: 2, look: 'right', eyes: 'open', mouth: 'flat', water: [30, 21, 0] }, 3)
  for (let i = 0; i < 3; i++) wait(i + 1, i % 2, { mouth: 'smile', eyes: i === 1 ? 'blink' : 'half' }, 4)
  // ---- reel in: the rod lifts, the line comes up with the bobber, the hook is out of the water
  add({ rod: [31, 8], bobber: [30, 15], line: [31, 14], hook: [31, 20], worm: 2, look: 'right', eyes: 'wide', mouth: 'open', water: [30, 21, 1], splash: 2 }, 1)
  add({ rod: [31, 6], bobber: [30, 11], line: [31, 10], hook: [31, 16], worm: 3, look: 'up', eyes: 'wide', mouth: 'open' }, 1)
  add({ rod: [29, 4], line: [29, 7], hook: [29, 8], look: 'up', eyes: 'open', mouth: 'flat' }, 2)
  // ---- he looks at the hook: the rod lies across his belly again and the hook is empty
  add({ ...bait, look: 'down', eyes: 'half', mouth: 'flat', armL: 'cross' }, 4)
  add({ ...bait, look: 'left', eyes: 'half', mouth: 'flat', armL: 'cross' }, 3)
  add({ ...bait, look: 'down', eyes: 'open', mouth: 'o', armL: 'cross' }, 3)
  // ...nothing: a shrug, then the next worm
  add({ ...bait, look: 'right', eyes: 'half', mouth: 'grim', armL: 'up', armR: 'hold' }, 5)
  add({ ...bait, look: 'right', eyes: 'half', mouth: 'grim', armL: 'half' }, 2)
  return out
}

/** Typing and running share one loop of 16 frames, each the same time. */
const isTapping = (id: StateId): boolean => id === 'typing' || id === 'running'

/**
 * The frame of that loop on screen `msSinceLoop` after the loop began (0 for any other state). A move out of typing or running
 * begins on THIS frame, not on the first: starting from frame 0 jumped the lines of code (they are part of every frame) and the
 * gum, which showed as a blink every time he left, or went from typing to running.
 */
export function loopFrame(id: StateId, msSinceLoop: number): number {
  if (!isTapping(id) || msSinceLoop <= 0) return 0
  const d = STATES[id]
  return Math.floor(msSinceLoop / (d.fd * 1000)) % d.frames.length
}

/** Where a move out of `id` begins: the loop frame he is on (his first frame for any state but typing and running). */
const startOf = (id: StateId, phase: number): Pose => (isTapping(id) && phase > 0 ? unheld(STATES[id].frames[phase] ?? STATES[id].frames[0] ?? {}) : F(id))

/**
 * The lines of code behind running only live while his laptop is open, and they come and go like real output scrolling by:
 * into running they start after the laptop has opened, the first lines at the bottom and more of them added as they rise
 * (`codeLo`, the highest row shown, climbs to the top); out of it the bottom lines finish first and the rest follow upward
 * (`codeHi`, the lowest row shown, climbs to the top) until nothing is left, before the laptop closes. A line at the edge is
 * short and grows (or shrinks) as it is passed (sprite.ts). They finish early (CODE_OUT, CODE_IN of the laptop's open time).
 * When the laptop is open for only a moment of the move (a prop swap takes it away at once) his own frame is held a few
 * frames, laptop open, so the sweep is always seen. The first frame of a move out, and the last of a move in, are his own
 * (all the lines); the rest are set here whatever the move drew, so a prop never carries a stale line along. The scroll
 * runs on from the frame before and ends on his own scroll (0) at the loop's first frame, so no line ever jumps.
 */
const CODE_OUT = 0.8
const CODE_IN = 0.8
const CODE_FRAMES = 5
const CODE_H = 28
function fadeCode(frames: Pose[], from: StateId, to: StateId): Pose[] {
  const goes = from === 'running' && to !== 'running'
  const comes = to === 'running' && from !== 'running'
  if (!goes && !comes) return frames
  const strip = (f: Pose): Pose => {
    const { code: _c, codeA: _a, codeLo: _l, codeHi: _h, ...rest } = f
    return rest
  }
  const held = (f: Pose): Pose => {
    const { hold: _h, ...rest } = strip(f)
    return rest
  }
  const pad = from !== 'cold' && to !== 'cold' // a move with the cold has a fixed time: nothing is added to it
  let fr = frames
  if (goes) {
    // the laptop is open up to the frame before it goes
    let open = fr.findIndex((f, i) => i > 0 && f.laptop === undefined)
    open = open < 0 ? fr.length : open
    if (pad && open - 1 < CODE_FRAMES) fr = [fr[0]!, ...Array.from({ length: CODE_FRAMES - (open - 1) }, () => held(fr[0]!)), ...fr.slice(1)]
    const last = fr.findIndex((f, i) => i > 0 && f.laptop === undefined)
    const end = (last < 0 ? fr.length : last) - 1 // the last frame with the laptop open
    return fr.map((f, i) => {
      if (i === 0) return f
      const hi = Math.round(CODE_H * (1 - i / (end * CODE_OUT)))
      return i < end && hi > 0 ? { ...strip(f), code: (fr[0]!.code ?? 0) + 2 * i, codeHi: hi } : strip(f)
    })
  }
  // the laptop is open from the first frame after which none lacks it
  const lacks = fr.reduce((a, f, i) => (f.laptop === undefined ? i : a), -1)
  const n0 = fr.length
  if (pad && n0 - 2 - lacks < CODE_FRAMES) fr = [...fr.slice(0, -1), ...Array.from({ length: CODE_FRAMES - (n0 - 2 - lacks) }, () => held(fr[n0 - 1]!)), fr[n0 - 1]!]
  const open = fr.reduce((a, f, i) => (f.laptop === undefined ? i : a), -1) + 1 // first frame with the laptop open for good
  const n = fr.length
  return fr.map((f, i) => {
    if (i === n - 1) return f
    if (i <= open) return strip(f)
    const p = (i - open) / (n - 1 - open)
    const lo = Math.round(CODE_H * (1 - p / CODE_IN))
    // the scroll ends on 0 at the last frame, so the loop that follows takes it on without a jump
    return { ...strip(f), code: 2 * (i - (n - 1)), ...(lo > 0 ? { codeLo: lo } : {}) }
  })
}

function rawMoveOf(from: StateId, to: StateId, phase = 0): (Move & { w: number }) | null {
  if (from === to) return null
  const m = MOVES[`${from}>${to}`]
  // Typing and running are the same body: nothing is taken or fetched, no blink and no hop, only the code. He keeps tapping from
  // the frame he is on (the last tap before the end is the odd one, so the arms alternate into his first frame).
  if (m && isTapping(from) && isTapping(to)) {
    if (phase <= 0) return { fd: m.fd, frames: m.frames, w: 34 }
    const taps = Array.from({ length: (phase + 5) % 2 === 1 ? 5 : 6 }, (_, k) => TAP(phase + k + 1))
    return { fd: m.fd, frames: [startOf(from, phase), ...taps, m.frames[m.frames.length - 1]!], w: 34 }
  }
  if (m) return { ...paced(smooth([startOf(from, phase), ...m.frames.slice(1)]), from), w: 34 }
  const a = STATES[from]
  const b = STATES[to]
  // Drawn on the canvas of the state he enters (the band's layout is fixed by it); a wider scene he leaves is skipped.
  const w = b.w ?? 34
  const first = (a.w ?? 34) <= w ? [isTapping(from) && phase > 0 ? startOf(from, phase) : L(from)] : []
  if (to === 'cold' || from === 'cold') {
    const mid: Pose[] = [{ ...NEUTRAL }, { eyes: 'half', mouth: 'grim' }, { eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half' }, { eyes: 'half', mouth: 'grim', armL: 'half', armR: 'half' }]
    return { ...tinted(smooth([...first, ...mid, b.frames[0] ?? {}]), to === 'cold'), w }
  }
  if (to === 'asleep') return { ...paced(smooth([...first, { ...NEUTRAL, eyes: 'open' }, ...RISE, b.frames[0] ?? {}]), from), w }
  // Reading brings a lot with it (glasses, a book, a stack of books): they come and go one at a time, not all at once.
  if (to === 'reading') return { ...paced(smooth([...first, { ...NEUTRAL }, { glasses: 1, look: 'down', eyes: 'half' }, { glasses: 1, stack: 1, look: 'down', eyes: 'half', armL: 'hold', armR: 'hold' }, b.frames[0] ?? {}]), from), w }
  if (from === 'reading') return { ...paced(smooth([...first, { glasses: 1, stack: 1, look: 'down', eyes: 'half' }, { glasses: 1, look: 'down', eyes: 'half' }, { ...NEUTRAL }, b.frames[0] ?? {}]), from), w }
  return { ...paced(smooth([...first, ...(from === 'ship' ? SHIP_OUT : []), ...leaving(from), { ...NEUTRAL }, ...(ENTER[to] ?? []), ...(to === 'ship' ? SHIP_IN : []), b.frames[0] ?? {}]), from), w }
}

/** How long a move plays, in ms; 0 when nothing changes. */
export function moveMs(from: StateId, to: StateId, phase = 0): number {
  const m = moveOf(from, to, phase)
  return m ? Math.round(onceSeconds(m.frames, m.fd) * 1000) : 0
}

const moveCache = new Map<string, Mascot>()

/** The markup of one move at 2x (or 1x for the small size), or null when nothing changes. */
export function moveMarkup(from: StateId, to: StateId, scale: 1 | 2 = 2, phase = 0): Mascot | null {
  const key = `${from}>${to}${isTapping(from) ? `#${phase}` : ''}@${scale}`
  const hit = moveCache.get(key)
  if (hit) return hit
  const m = moveOf(from, to, phase)
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
export function enterMarkup(from: StateId, to: StateId, clock = '', scale: 1 | 2 = 2, phase = 0): Mascot {
  const m = moveOf(from, to, phase)
  if (!m) return stateMarkup(to, clock, scale)
  const key = `${from}>${to}${isTapping(from) ? `#${phase}` : ''}${to === 'asleep' ? `:${clock}` : ''}@${scale}`
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
export const moveFrames = (from: StateId, to: StateId, phase = 0): { frames: Pose[]; w: number } | null => moveOf(from, to, phase)

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
