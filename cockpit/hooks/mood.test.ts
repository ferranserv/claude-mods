import { describe, expect, test } from 'claude-code/testing'

import { COFFEE_AFTER_MS, COFFEE_CYCLE_MS, COFFEE_SHOW_MS, ROTATE_MS, activeAlerts, bubbleFor, clockOf, hoverHint, isAlert, nextShift, pickState, rank } from './mood'
import type { BubbleInput, MoodInput } from './mood'
import type { StateId } from './states'
import { MOVES, STATES, STATE_IDS, enterMarkup, moveFrames, moveMarkup, moveMs, stateMarkup } from './states'
import { clawd, pixelsOutside } from './sprite'

const NOW = 1_000_000
const calm: MoodInput = {
  now: NOW, waiting: false, writing: false, fleet: {}, compacting: false, tool: null, walkUntil: 0, helloUntil: 0,
  ctx: 'calm', cache: 'warm', fiveUsed: 10, weekRoom: 30, hasAdvice: false, hasNote: false, busy: false, busyMs: 0, hasTool: false, offline: false,
}
const mood = (o: Partial<MoodInput>) => pickState({ ...calm, ...o })

describe('which state wins', () => {
  test('nothing going on: idle', () => expect(mood({})).toBe('idle'))

  test('a permission prompt beats everything, even a fleeting event', () => {
    expect(mood({ waiting: true, fleet: { oops: NOW + 1000 }, fiveUsed: 100 })).toBe('hand')
  })

  test('a plan waiting for approval ranks with the raised hand, over the task events', () => {
    expect(mood({ fleet: { idea: NOW + 1, oops: NOW + 1 } })).toBe('idea')
    expect(mood({ waiting: true, fleet: { idea: NOW + 1 } })).toBe('hand')
  })

  test('among fleeting events the order is oops, boom, bell, lab, ship, love, wand, coins, plug', () => {
    const all = { oops: NOW + 1, boom: NOW + 1, bell: NOW + 1, lab: NOW + 1, ship: NOW + 1, love: NOW + 1, wand: NOW + 1, coins: NOW + 1, plug: NOW + 1 }
    const order = ['oops', 'boom', 'bell', 'lab', 'ship', 'love', 'wand', 'coins', 'plug'] as const
    const left: Partial<typeof all> = { ...all }
    for (const id of order) {
      expect(mood({ fleet: left })).toBe(id)
      delete left[id]
    }
    expect(mood({ fleet: left })).toBe('idle')
  })

  test('the bell plays first, the alerts come after it', () => {
    const lasting = { fiveUsed: 100 }
    expect(mood({ ...lasting, fleet: { bell: NOW + 2000 } })).toBe('bell')
    expect(mood({ ...lasting, fleet: { bell: NOW - 1 } })).toBe('asleep')
  })

  test('a tool at work shows over everything but the hand; compacting beats a tool', () => {
    expect(mood({ busy: true, tool: { kind: 'building', until: NOW + 500 } })).toBe('building')
    expect(mood({ compacting: true, tool: { kind: 'reading', until: NOW + 1 } })).toBe('dizzy')
  })

  test('a shell command that runs shows running, over coffee and typing, under the tools with a pose of their own', () => {
    expect(mood({ busy: true, hasTool: true, tool: { kind: 'running', until: NOW + 500 } })).toBe('running')
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS + 1000, tool: { kind: 'running', until: NOW + 500 } })).toBe('running')
    expect(mood({ busy: true, hasTool: true, tool: { kind: 'running', until: NOW - 1 } })).toBe('typing') // it ended and the linger is over
    expect(mood({ waiting: true, busy: true, tool: { kind: 'running', until: NOW + 500 } })).toBe('hand')
    expect(rank('running')).toBeLessThan(rank('typing'))
    expect(rank('running')).toBeGreaterThan(rank('browse'))
  })

  test('while Claude works no status alert shows, not even a critical one', () => {
    const all = { fiveUsed: 100, weekRoom: -5, ctx: 'alert' as const, cache: 'cold' as const, hasAdvice: true, offline: true, hasNote: true }
    expect(mood({ ...all, busy: true })).toBe('thinking')
    expect(mood({ ...all, busy: true, hasTool: true })).toBe('typing')
    expect(mood({ ...all, busy: true, tool: { kind: 'reading', until: NOW + 1 } })).toBe('reading')
    for (const id of ['asleep', 'mad', 'fire', 'gauge', 'sleepy', 'drunk', 'cold', 'hourglass', 'detective', 'plug'] as const) expect(isAlert(id)).toBe(true)
    for (const id of ['hand', 'idea', 'oops', 'boom', 'ship', 'bell', 'lab', 'typing', 'running', 'coffee', 'talk', 'idle'] as const) expect(isAlert(id)).toBe(false)
  })

  test('when it is over the alerts are listed worst first and each is true only on its own range', () => {
    expect(activeAlerts({ ...calm, fiveUsed: 100, weekRoom: -1, ctx: 'alert', hasAdvice: true, cache: 'cold', offline: true })).toEqual(['asleep', 'mad', 'fire', 'cold', 'detective', 'plug'])
    expect(activeAlerts({ ...calm, weekRoom: 1, ctx: 'warn', fiveUsed: 85, cache: 'soon' })).toEqual(['gauge', 'sleepy', 'drunk', 'hourglass'])
    expect(activeAlerts(calm)).toEqual([])
  })

  test('several alerts take turns, ROTATE_MS each; a single one stays', () => {
    const two = { ctx: 'warn' as const, cache: 'cold' as const }
    const seen = [0, 1, 2, 3].map(k => mood({ ...two, now: k * ROTATE_MS }))
    expect(new Set(seen)).toEqual(new Set(['drunk', 'cold']))
    expect(seen[0]).not.toBe(seen[1])
    expect(mood({ ctx: 'warn', now: 0 })).toBe(mood({ ctx: 'warn', now: ROTATE_MS }))
    expect(nextShift({ ...calm, ...two, now: 1000 })).toBe(ROTATE_MS - 1000)
    expect(nextShift({ ...calm, ctx: 'warn' })).toBeNull()
  })

  test('a notice shows before the alerts, never while working', () => {
    expect(mood({ hasNote: true, ctx: 'alert' })).toBe('talk')
    expect(mood({ hasNote: true, busy: true })).toBe('thinking')
  })

  test('a connector still down is an alert after the turn, an event during it', () => {
    expect(mood({ offline: true })).toBe('plug')
    expect(mood({ offline: true, busy: true })).toBe('thinking')
    expect(mood({ fleet: { plug: NOW + 1 }, busy: true })).toBe('plug')
  })

  test('findings and the cache wait for Claude to stop', () => {
    expect(mood({ hasAdvice: true, busy: true })).toBe('thinking')
    expect(mood({ hasAdvice: true })).toBe('detective')
    expect(mood({ cache: 'cold', busy: true })).toBe('thinking')
    expect(mood({ cache: 'soon', busy: true, hasTool: true })).toBe('typing')
  })

  test('working: thinking before any tool, typing after', () => {
    expect(mood({ busy: true })).toBe('thinking')
    expect(mood({ busy: true, hasTool: true })).toBe('typing')
  })

  test('coffee starts at 7 minutes, then comes for a few seconds and goes back to the work', () => {
    expect(COFFEE_AFTER_MS).toBe(7 * 60_000)
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS - 1 })).toBe('typing')
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS + 1 })).toBe('coffee')
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS + COFFEE_SHOW_MS })).toBe('typing')
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS + COFFEE_CYCLE_MS + 1 })).toBe('coffee')
    expect(mood({ busy: true, busyMs: COFFEE_AFTER_MS + COFFEE_SHOW_MS })).toBe('thinking')
    expect(nextShift({ ...calm, busy: true, busyMs: 1000 })).toBe(COFFEE_AFTER_MS - 1000)
    expect(nextShift({ ...calm, busy: true, busyMs: COFFEE_AFTER_MS + 1000 })).toBe(COFFEE_SHOW_MS - 1000)
  })

  test('session start: walk, then hello, both below a tool and above an alert', () => {
    expect(mood({ walkUntil: NOW + 1, helloUntil: NOW + 1 })).toBe('walk')
    expect(mood({ helloUntil: NOW + 1, ctx: 'alert' })).toBe('hello')
    expect(mood({ walkUntil: NOW + 1, tool: { kind: 'reading', until: NOW + 1 } })).toBe('reading')
  })

  test('a notice with nothing else going on: talk', () => expect(mood({ hasNote: true })).toBe('talk'))
})

describe('the bubble', () => {
  const b: BubbleInput = { ctxPercent: 62, ctxText: 'Quality may start to slip.', cacheLabel: '4m', fiveUsed: 85, fiveReset: '14:20', weekPace: 'Wed 5% over', weekRoom: -5, saverOn: false, detail: 'app.ts', savedUsd: '$0.04', hasAdvice: false }
  test('warnings stand for their alert row and offer the action', () => {
    expect(bubbleFor('fire', b)).toMatchObject({ alertId: 'ctx', action: 'copy' })
    expect(bubbleFor('hourglass', b)).toMatchObject({ alertId: 'cache', action: 'handoff' })
    expect(bubbleFor('sleepy', b)).toMatchObject({ alertId: 'five', action: 'saverOn' })
    expect(bubbleFor('asleep', b)?.text).toContain('14:20')
  })
  test('with the saver already on, the saver warnings say nothing', () => {
    for (const id of ['mad', 'gauge', 'sleepy'] as const) expect(bubbleFor(id, { ...b, saverOn: true })).toBeNull()
  })
  test('tool states name the file; a failure names the tool', () => {
    expect(bubbleFor('building', b)?.text).toBe('Editing app.ts')
    expect(bubbleFor('oops', { ...b, detail: 'Edit' })?.text).toBe('Edit failed')
  })
  test('preflight speaks through its own rows', () => expect(bubbleFor('detective', b)).toBeNull())
  test('the wake-up clock is HH:MM, or dashes when unknown', () => {
    expect(clockOf(new Date(2026, 9, 21, 14, 5).toISOString())).toBe('14:05')
    expect(clockOf(undefined)).toBe('--:--')
  })
})

describe('the drawings', () => {
  test('every state renders, fits the Svg limit, and draws nothing outside its canvas', () => {
    for (const id of STATE_IDS) {
      const d = STATES[id]
      const m = stateMarkup(id)
      expect(m.markup.length).toBeLessThan(60_000)
      expect(m.markup).not.toContain('NaN')
      expect(m.height).toBe(56)
      expect(pixelsOutside(d.frames, d.w ?? 34)).toBe(0)
      expect(d.label.length).toBeGreaterThan(5)
    }
  })
  test('34 states, each with a terminal face', () => {
    expect(STATE_IDS.length).toBe(34)
    for (const id of STATE_IDS) expect(STATES[id].face.length).toBeGreaterThan(2)
  })
  test('the alarm clock shows the wake-up time it is given', () => {
    expect(stateMarkup('asleep', '14:20').markup).not.toBe(stateMarkup('asleep', '09:05').markup)
    expect(stateMarkup('asleep', '14:20').width).toBe(68) // the clock sits beneath him: no wider than any other state
  })
  test('animated states swap frames; every state starts from the same neutral pose', () => {
    expect(stateMarkup('typing').markup).toContain('attributeName="opacity"')
    for (const id of STATE_IDS) {
      const f = STATES[id].frames[0] ?? {}
      expect(f.dx ?? 0).toBe(0)
      expect(f.dy ?? 0).toBe(0)
      expect(f.legsUp).toBeUndefined()
    }
    expect(stateMarkup('walk').markup).toContain('animateTransform')
  })
})

describe('animation with flavour', () => {
  test('his left arm moves in every state (but the one that sleeps)', () => {
    const still = STATE_IDS.filter(id => !STATES[id].frames.some(f => f.armL !== undefined && f.armL !== 'rest'))
    expect(still.sort()).toEqual(['asleep'])
  })
  /**
   * The flipbook test: play a loop frame by frame and see what blinks. Whatever is drawn on top of him (a comic stroke, a
   * brow, a drop of sweat, a tear) must stay at least EFFECT_S, or it reads as a blink and not as a movement; his eyes
   * and his left hand must hold a look for LOOK_S before they change (a loop that changes them every frame looks nervous).
   */
  const EFFECT_S = 0.45
  const LOOK_S = 0.2
  const secs = (id: StateId) => STATES[id].frames.map(f => (f.hold ?? 1) * STATES[id].fd)
  /** Durations of each run of equal values around the loop (the first and last runs are one when they match). */
  const runs = (id: StateId, of: (f: Record<string, unknown>) => string): number[] => {
    const fr = STATES[id].frames as Record<string, unknown>[]
    const t = secs(id)
    const keys = fr.map(of)
    if (new Set(keys).size === 1) return [Infinity]
    const out: number[] = []
    let start = keys.findIndex((k, i) => k !== keys[(i + keys.length - 1) % keys.length])
    for (let n = 0, i = start; n < keys.length; ) {
      let d = 0
      const k = keys[i]
      while (n < keys.length && keys[i] === k) { d += t[i]!; i = (i + 1) % keys.length; n++ }
      out.push(d)
    }
    return out
  }
  test('flipbook: an effect on top of him is never on screen for a blink', () => {
    const present = (key: string) => (f: Record<string, unknown>) => (f[key] === undefined ? 'no' : 'yes')
    const bad: string[] = []
    for (const id of STATE_IDS) for (const key of ['lines', 'sweatFly', 'orbit', 'brow', 'vein', 'tear', 'star', 'burst', 'soot', 'puff', 'thrust', 'smokeP'])
      for (const [i, d] of runs(id, present(key)).entries()) if (d < EFFECT_S && runs(id, present(key))[i] !== undefined && STATES[id].frames.some(f => (f as Record<string, unknown>)[key] !== undefined)) bad.push(`${id}.${key} ${d.toFixed(2)}s`)
    // a burst is meant to be quick: burst, soot and the engine's flame only need to last as long as the move they make
    expect(bad.filter(b => !/^(boom|ship)\./.test(b))).toEqual([])
  })
  test('flipbook: his eyes hold a look, and his left hand a position, long enough to be read', () => {
    const look = (f: Record<string, unknown>) => `${f.eyes ?? 'open'}|${f.eyeL ?? ''}|${f.eyeR ?? ''}|${f.look ?? ''}`
    const arm = (f: Record<string, unknown>) => String(f.armL ?? 'rest')
    const bad: string[] = []
    for (const id of STATE_IDS) {
      for (const d of runs(id, look)) if (d < LOOK_S && d !== Infinity && id !== 'boom') bad.push(`${id} eyes ${d.toFixed(2)}s`)
      if (!['typing', 'running', 'fire', 'mad', 'walk', 'dizzy', 'asleep', 'ship', 'boom', 'bell'].includes(id)) for (const d of runs(id, arm)) if (d < LOOK_S && d !== Infinity) bad.push(`${id} armL ${d.toFixed(2)}s`)
    }
    expect(bad).toEqual([])
  })
  test('the flakes fall down the edges and over his head, never next to his hands', () => {
    const base = { w: 34, ...STATES.cold.frames[0], snow: undefined }
    const without = clawd(base).g
    for (const f of STATES.cold.frames) {
      const g = clawd({ w: 34, ...f }).g
      const none = clawd({ w: 34, ...f, snow: undefined }).g
      g.forEach((row: (string | null)[], y: number) => row.forEach((c, x) => {
        if (c !== none[y][x]) expect(x <= 4 || x >= 30 || y <= 7, `flake at ${x},${y}`).toBe(true)
      }))
    }
    expect(without.length).toBeGreaterThan(0)
  })
  test('no whistle notes in idle, no snore bubble in asleep, no loose sparkles anywhere', () => {
    expect(STATES.idle.frames.every(f => f.notes === undefined)).toBe(true)
    expect(STATES.asleep.frames.every(f => f.snore === undefined)).toBe(true)
    for (const id of STATE_IDS) expect(STATES[id].frames.every(f => f.spark === undefined && f.glint === undefined && f.dots === undefined && f.dust === undefined), id).toBe(true)
  })
  test('the rocket leaves the screen completely, in small steps, and a new one rises into place so the loop ends where it began', () => {
    const fr = STATES.ship.frames
    const ys = fr.filter(f => f.thrust === 3).map(f => f.rocket as number)
    expect(Math.min(...ys)).toBeLessThanOrEqual(-9) // its nine rows are all above the canvas
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!, `step ${i}`).toBeLessThanOrEqual(4)
    const last = fr[fr.length - 1]!
    expect(last).toMatchObject({ console: 0, rocket: 15, look: 'right' })
    expect(fr[0]).toMatchObject({ console: 0, rocket: 15, look: 'right' })
    expect(fr.some(f => f.thrust === undefined && f.rocket !== undefined && f.rocket > 15)).toBe(true) // the next rocket rises from below
  })
  test('leaving ship: the console and the rocket sink out of the canvas instead of vanishing, and coming back they rise', () => {
    for (const to of ['idle', 'bell', 'typing', 'drunk'] as const) {
      const fr = moveFrames('ship', to)!.frames
      expect(fr.some(f => (f.consoleDy ?? 0) >= 5), `ship>${to}`).toBe(true)
    }
    for (const from of ['typing', 'idle', 'bell'] as const) expect(moveFrames(from, 'ship')!.frames.some(f => (f.consoleDy ?? 0) >= 5), `${from}>ship`).toBe(true)
  })
  test('frames have their own timing: a held pose, a quick lift-off', () => {
    const ship = STATES.ship.frames
    expect(Math.max(...ship.map(f => f.hold ?? 1))).toBeGreaterThanOrEqual(10)
    expect(ship.some(f => (f.hold ?? 1) === 1)).toBe(true)
    const times = (stateMarkup('ship').markup.match(/keyTimes="([^"]+)"/)?.[1] ?? '').split(';').map(Number)
    const steps = new Set(times.slice(1).map((t, i) => (t - times[i]!).toFixed(3)))
    expect(steps.size).toBeGreaterThan(2) // not equal steps
  })
  test('boom ends on the pose his moves out of it start from', () => {
    expect(STATES.boom.leave).toBeDefined()
    expect(STATES.boom.frames[STATES.boom.frames.length - 1]).toMatchObject(STATES.boom.leave!)
  })
  test('cold has plain eyes, teeth that chatter and only a slight shiver', () => {
    const fr = STATES.cold.frames
    expect(fr.every(f => f.eyes === 'open' && f.brow === undefined && f.look === undefined)).toBe(true)
    expect(fr.some(f => f.mouth === 'chatter')).toBe(true)
    expect(Math.max(...fr.map(f => Math.abs(f.dx ?? 0)))).toBeLessThanOrEqual(1)
    expect(fr.filter(f => f.dx).length).toBeLessThanOrEqual(fr.length / 2)
  })
  test('requested clean-ups: no sweat on fire, no sparkles on drunk, no tool-failed lines, no tear or worried eyes without a connector, a smile all through the launch', () => {
    expect(STATES.fire.frames.every(f => f.sweatFly === undefined && f.forehead === undefined)).toBe(true)
    expect(STATES.drunk.frames.every(f => f.orbit === undefined)).toBe(true)
    expect(STATES.oops.frames.every(f => f.lines === undefined)).toBe(true)
    expect(STATES.plug.frames.every(f => f.tear === undefined && f.eyes !== 'sad')).toBe(true)
    expect(STATES.ship.frames.every(f => f.mouth === 'smile')).toBe(true)
  })
  test('the hourglass turns over when the sand has run, so the loop does not jump', () => {
    const fr = STATES.hourglass.frames
    expect(fr.some(f => f.hgTurn)).toBe(true)
    expect(Math.max(...fr.filter(f => f.hourglass).map(f => f.sand as number))).toBe(3)
  })
  test('almost out for today: a piggy bank shaken upside-down, the last coin falls to the floor, bounces and rolls out of the picture', () => {
    const fr = STATES.gauge.frames
    expect(fr.every(f => f.gauge === undefined && f.pig === 1)).toBe(true)
    expect(fr.some(f => f.pigFlip)).toBe(true)
    const ys = fr.filter(f => f.fcy !== undefined).map(f => f.fcy as number)
    expect(Math.max(...ys) + 2).toBe(23) // the coin rests on the line of his feet (rows 21 to 23)
    const land = ys.indexOf(Math.max(...ys))
    expect(ys.slice(land + 1).some(y => y < Math.max(...ys))).toBe(true) // and it bounces
    expect(Math.max(...fr.map(f => f.fcx ?? 0))).toBeGreaterThanOrEqual(34) // then rolls out of the canvas
    expect(fr[fr.length - 1]!.fcy).toBeUndefined() // nothing left on the floor when the loop starts again
  })
  test('reading and painting have a move each way', () => {
    expect(MOVES['reading>creating']).toBeDefined()
    expect(MOVES['creating>reading']).toBeDefined()
  })
  test('thinking, the detective and coffee have long loops with a left hand', () => {
    expect(STATES.thinking.frames.length).toBeGreaterThanOrEqual(12)
    expect(STATES.detective.frames.length).toBeGreaterThanOrEqual(8)
    expect(STATES.coffee.frames.length).toBeGreaterThanOrEqual(12)
    expect(STATES.detective.frames.some(f => (f.mgx ?? 0) <= -8)).toBe(true) // the glass comes up to his eye
  })
  test('every pair of states has a move, hand-drawn or built from how each one begins, and over 90 are hand-drawn', () => {
    expect(Object.keys(MOVES).length).toBeGreaterThanOrEqual(90)
    for (const a of STATE_IDS) for (const b of STATE_IDS) if (a !== b) expect(moveMs(a, b), `${a}>${b}`).toBeGreaterThan(0)
  })
})

describe('the moves between states', () => {
  test('every move fits its canvas, plays once and then holds', () => {
    for (const key of Object.keys(MOVES)) {
      const [from, to] = key.split('>') as [StateId, StateId]
      const m = MOVES[key]!
      expect(STATE_IDS).toContain(from)
      expect(STATE_IDS).toContain(to)
      expect(pixelsOutside(m.frames, 34)).toBe(0)
      expect(moveMs(from, to)).toBeGreaterThan(0)
      const made = moveMarkup(from, to)!
      expect(made.markup).toContain('fill="freeze"')
      expect(made.markup).not.toContain('repeatCount="indefinite"')
    }
  })
  test('a hand-drawn move starts on the state it leaves and ends on the state it enters, so nothing pops', () => {
    const same = (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const clean = (p: Record<string, unknown>) => Object.entries(p).filter(([k, v]) => !((k === 'dx' || k === 'dy') && !v) && k !== 'hold').sort(([x], [y]) => (x < y ? -1 : 1))
      return JSON.stringify(clean(a)) === JSON.stringify(clean(b))
    }
    for (const key of Object.keys(MOVES)) {
      const [from, to] = key.split('>') as [StateId, StateId]
      const f = MOVES[key]!.frames
      expect(same(f[0]!, STATES[from].leave ?? STATES[from].frames[0]!), `${key} start`).toBe(true)
      expect(same(f[f.length - 1]!, STATES[to].frames[0]!), `${key} end`).toBe(true)
    }
  })
  test('a state change is one drawing: the move, then the loop that starts when it ends', () => {
    const e = enterMarkup('idle', 'thinking')
    const dur = moveMs('idle', 'thinking') / 1000
    expect(e.markup).toContain('repeatCount="1"')
    expect(e.markup).toContain('repeatCount="indefinite"')
    expect(e.markup).toContain(`begin="${dur.toFixed(2)}s"`) // the loop waits for the move
    expect(e.markup).toContain('attributeName="display"') // and the move hides when it is over
    expect(e.width).toBe(stateMarkup('thinking').width)
    expect(enterMarkup('idle', 'thinking').markup).toBe(e.markup) // the same string every time: no reload
    expect(enterMarkup('idle', 'idle').markup).toBe(stateMarkup('idle').markup)
  })
  test('there are at least 45 hand-drawn moves, covering the common flows', () => {
    expect(Object.keys(MOVES).length).toBeGreaterThanOrEqual(45)
    for (const key of ['idle>thinking', 'hand>building', 'building>oops', 'typing>lab', 'typing>coffee', 'typing>browse', 'writing>love', 'thinking>bell']) expect(MOVES[key], key).toBeDefined()
  })
  test('moves are eased: a short first frame, a longer settling last frame, a blink over the swap', () => {
    for (const key of Object.keys(MOVES)) {
      const [from, to] = key.split('>') as [StateId, StateId]
      const m = moveFrames(from, to)!
      if (m.frames.length < 3 || ((from === 'typing' || from === 'running') && (to === 'typing' || to === 'running'))) continue // typing <-> running is the same body, so no blink and no hop
      expect(m.frames[0]!.hold, `${key} first`).toBeLessThan(1)
      expect(m.frames[m.frames.length - 1]!.hold, `${key} last`).toBeGreaterThan(1)
      expect(m.frames.slice(1, -1).some(f => f.eyes === 'blink' || (f.eyes !== undefined && f.eyes !== 'open' && f.eyes !== 'half')), `${key} blink or an expressive look in the middle`).toBe(true)
    }
  })
  test('a prop that goes is carried in his hand and put behind him; one that comes is fetched the same way; one hand takes off and the other puts on', () => {
    const gone = moveFrames('idle', 'thinking')!.frames
    const carried = gone.filter(f => f.carry === 'shades')
    expect(carried.length).toBeGreaterThanOrEqual(2) // lifted in his hand, then swung out behind him
    expect(carried.every(f => f.carrySide === 'L')).toBe(true) // the sunglasses go with the LEFT hand
    expect(carried.some(f => f.at === 1 && f.armL === 'up')).toBe(true)
    expect(carried.some(f => f.at === 3 && f.armL === 'out')).toBe(true)
    expect(carried.every(f => f.shades === undefined)).toBe(true) // it is in his hand, no longer on his face
    const came = moveFrames('bell', 'idle')!.frames
    expect(came.some(f => f.carry === 'bell' && f.carrySide === 'R')).toBe(true) // the bell is put away with the right
    expect(came.some(f => f.carry === 'shades' && f.at === 3 && f.armL === 'out' && f.carrySide === 'L')).toBe(true) // and the shades come back from behind him in the left
    const swap = moveFrames('typing', 'building')!.frames
    expect(swap.some(f => f.carry === 'laptop' && f.carrySide === 'L')).toBe(true) // the laptop leaves with the left hand
    expect(swap.some(f => f.carry === 'hat-hard' && f.carrySide === 'R')).toBe(true) // the hard hat is put on with the right
  })
  test('any state to cold turns him blue slowly, over two seconds; coming back out of it takes 1.2', () => {
    for (const id of STATE_IDS) {
      if (id === 'cold') continue
      expect(moveMs(id, 'cold'), `${id}>cold`).toBe(2000)
      expect(moveMs('cold', id), `cold>${id}`).toBe(1200)
    }
    const f = moveFrames('idle', 'cold')!.frames
    const reds = f.map(x => (x.pal ? parseInt((x.pal as Record<string, string>).c!.slice(1, 3), 16) : null)).filter((v): v is number => v !== null)
    expect(reds.length).toBeGreaterThanOrEqual(5) // a color at every step, not a jump
    for (let i = 1; i < reds.length; i++) expect(reds[i]!).toBeLessThan(reds[i - 1]!) // each a little bluer than the one before
    expect(f[0]!.pal).toBeUndefined() // he starts in his own colors
    expect((f[f.length - 1]!.pal as Record<string, string>).c).toBe('#8fb9d9') // and ends frozen
    const back = moveFrames('cold', 'idle')!.frames
    expect((back[0]!.pal as Record<string, string>).c).toBe('#8fb9d9')
    expect(back[back.length - 1]!.pal).toBeUndefined()
  })
  test('what he carries in his hand is a prop of one of the two states, and none looks like a bell but the bell', () => {
    const mini = (k: string) => k
    for (const a of STATE_IDS) for (const b of STATE_IDS) {
      const m = moveFrames(a, b)
      if (!m) continue
      const own = new Set([...STATES[a].frames, ...STATES[b].frames].flatMap(fr => Object.keys(fr)))
      for (const fr of m.frames) {
        if (!fr.carry) continue
        const key = mini(String(fr.carry)).replace(/^hat-.*/, 'hat')
        expect(own.has(key), `${a}>${b} carries ${fr.carry}`).toBe(true)
        if (fr.carry === 'bell') expect([a, b].includes('bell'), `${a}>${b} carries a bell`).toBe(true)
      }
    }
    const hand = moveFrames('idle', 'hand')!.frames.filter(fr => fr.carry)
    expect(hand.map(fr => fr.carry)).not.toContain('bell')
  })
  test('going to bed: the clock rises and pushes him up, he hops, his legs fold away and he slumps onto it', () => {
    const f = moveFrames('sleepy', 'asleep')!.frames
    const rise = f.filter(x => x.clockY !== undefined)
    expect(rise.length).toBeGreaterThanOrEqual(3)
    expect(rise.map(x => x.clockY)).toEqual([...rise.map(x => x.clockY)].sort((a, b) => b - a)) // it only goes up
    expect(f.some(x => x.dy === -1 && x.lift === 3)).toBe(true) // the hop
    expect(f.some(x => x.noLegs === 1 && (x.dy ?? 0) >= 1)).toBe(true) // collapsed on it
    expect(f[f.length - 1]!.mask).toBe(1) // and asleep, mask on
    expect(STATES.asleep.frames.every(x => x.noLegs === 1)).toBe(true)
  })
  test('sleepy yawns wide awake (eyes open between yawns), asking nothing of the zzz', () => {
    const fr = STATES.sleepy.frames
    expect(fr.some(x => x.mouth === 'yawn' && x.eyes === 'happy')).toBe(true)
    expect(fr.filter(x => x.eyes === 'open').length).toBeGreaterThanOrEqual(3)
    expect(fr.some(x => x.eyes === 'blink')).toBe(false)
    expect(fr.some(x => x.z !== undefined)).toBe(true)
  })
  test('the raised hand has an exclamation mark, and the detective a mouth', () => {
    expect(STATES.hand.frames.every(x => x.bangC !== undefined && x.bangC >= 1 && x.bangC <= 3)).toBe(true) // centered above his head, bobbing down to three pixels
    expect(new Set(STATES.hand.frames.map(x => x.bangC)).size).toBe(3) // and it does bob
    expect(STATES.detective.frames.every(x => x.mouth !== undefined)).toBe(true)
  })
  test('a pair without a hand-drawn move gets a morph; staying put gets nothing', () => {
    expect(moveMs('idle', 'asleep')).toBeGreaterThan(0)
    expect(moveMarkup('idle', 'asleep')).not.toBeNull()
    expect(moveMs('idle', 'idle')).toBe(0)
    expect(moveMarkup('idle', 'idle')).toBeNull()
  })
  test('every pair of states has a move that fits its canvas', () => {
    for (const from of STATE_IDS) {
      for (const to of STATE_IDS) {
        if (from === to) continue
        const m = moveFrames(from, to)!
        expect(pixelsOutside(m.frames, m.w)).toBe(0)
        const made = moveMarkup(from, to)!
        expect(made.markup.length).toBeLessThan(60_000)
        expect(made.markup).not.toContain('NaN')
      }
    }
  })
})

describe('done and the detective', () => {
  test('the bell is put away and the fedora and magnifier are fetched by hand, and back', () => {
    for (const key of ['bell>detective', 'detective>bell']) {
      expect(MOVES[key], key).toBeDefined()
      const [from, to] = key.split('>') as [StateId, StateId]
      expect(moveMs(from, to), key).toBeGreaterThan(0)
      expect(moveMarkup(from, to)?.markup ?? '', key).not.toContain('NaN')
    }
  })
})

describe('the painter moves', () => {
  test('he puts the brush and the palette away on the way to the hammer or the laptop, and fetches them on the way back', () => {
    for (const key of ['creating>building', 'building>creating', 'creating>typing', 'typing>creating']) {
      expect(MOVES[key], key).toBeDefined()
      const [from, to] = key.split('>') as [StateId, StateId]
      expect(moveMs(from, to), key).toBeGreaterThan(0)
      const src = moveMarkup(from, to)?.markup ?? ''
      expect(src, key).not.toContain('NaN')
    }
    // the palette shows small in his hand while it is taken or fetched (a hand-drawn carry), not as a pop
    expect(moveMarkup('creating', 'typing')?.markup.length).toBeGreaterThan(moveMarkup('idle', 'typing')!.markup.length * 0.5)
  })
})

describe('running: typing with code scrolling behind him', () => {
  test('the same drawing as typing, frame for frame, plus the code: same eyes, laptop, gum, arms and timing', () => {
    expect(STATES.running.frames.length).toBe(STATES.typing.frames.length)
    expect(STATES.running.fd).toBe(STATES.typing.fd)
    STATES.running.frames.forEach((f, i) => {
      const { code, ...rest } = f
      expect(rest, `frame ${i}`).toEqual(STATES.typing.frames[i])
      expect(code, `frame ${i}`).toBe(i * 2)
    })
    expect(STATES.typing.frames.every(f => f.code === undefined)).toBe(true)
  })
  test('the lines scroll 2 px a frame and the loop closes on a whole turn of the 32-row pattern', () => {
    expect((STATES.running.frames.length * 2) % 32).toBe(0)
    const a = clawd({ w: 34, ...STATES.running.frames[0], code: 0 }).g
    const b = clawd({ w: 34, ...STATES.running.frames[0], code: 32 }).g
    expect(b).toEqual(a)
    expect(clawd({ w: 34, ...STATES.running.frames[0], code: 2 }).g).not.toEqual(a)
  })
  test('the code is only ever behind him: it fills empty cells and changes nothing he draws, and stays in the canvas', () => {
    for (const f of STATES.running.frames) {
      const bare = clawd({ w: 34, ...f, code: undefined })
      const full = clawd({ w: 34, ...f })
      expect(full.oob.length).toBe(0)
      let lines = 0
      full.g.forEach((row: (string | null)[], y: number) => row.forEach((c, x) => {
        if (c !== bare.g[y][x]) { expect(bare.g[y][x], `${x},${y}`).toBeNull(); lines++ }
      }))
      expect(lines).toBeGreaterThan(20)
    }
  })
  test('a fade shrinks every dash to a third, then two thirds, then its whole length', () => {
    const lit = (a: number) => clawd({ w: 34, ...STATES.running.frames[0], codeA: a }).g.flat().filter((c: string | null) => c === 'A' || c === 'C' || c === 'H').length
    expect(lit(1)).toBeLessThan(lit(2))
    expect(lit(2)).toBeLessThan(lit(3))
    expect(lit(1)).toBeGreaterThan(0)
  })
  test('every move of typing has its twin for running, both ways, from and to his own first frame', () => {
    const twins = Object.keys(MOVES).filter(k => /(^|>)typing(>|$)/.test(k) && !/^(typing>running|running>typing)$/.test(k))
    expect(twins.length).toBeGreaterThanOrEqual(20)
    for (const key of twins) {
      const [from, to] = key.split('>')
      const twin = `${from === 'typing' ? 'running' : from}>${to === 'typing' ? 'running' : to}`
      expect(MOVES[twin], twin).toBeDefined()
      expect(MOVES[twin]!.frames.length).toBe(MOVES[key]!.frames.length)
      if (from === 'typing') expect(MOVES[twin]!.frames[0]).toEqual({ ...STATES.running.frames[0], hold: undefined })
      if (to === 'typing') expect(MOVES[twin]!.frames.at(-1)).toEqual({ ...STATES.running.frames[0], hold: undefined })
    }
    for (const id of STATE_IDS) if (id !== 'typing' && id !== 'running') {
      expect(moveMs('running', id), `running>${id}`).toBeGreaterThan(0)
      expect(moveMs(id, 'running'), `${id}>running`).toBeGreaterThan(0)
    }
  })
  test('into running the dashes grow, out of it they shrink away, finishing before the move does, and he does not blink or hop', () => {
    const level = (f: Record<string, unknown>) => (f.code === undefined ? 0 : ((f.codeA as number | undefined) ?? 3))
    for (const [from, to] of [['typing', 'running'], ['idle', 'running'], ['building', 'running'], ['ship', 'running']] as const) {
      const lv = moveFrames(from, to)!.frames.map(level)
      expect(lv[0], `${from}>${to} first`).toBe(0)
      expect(lv.at(-1), `${from}>${to} last`).toBe(3)
      if (lv.length >= 5) expect(lv.at(-2), `${from}>${to} full before the end`).toBe(3)
      for (let i = 1; i < lv.length; i++) expect(lv[i]!, `${from}>${to} ${i}`).toBeGreaterThanOrEqual(lv[i - 1]!)
    }
    for (const [from, to] of [['running', 'typing'], ['running', 'idle'], ['running', 'building'], ['running', 'ship']] as const) {
      const lv = moveFrames(from, to)!.frames.map(level)
      expect(lv[0], `${from}>${to} first`).toBe(3)
      expect(lv.at(-1), `${from}>${to} last`).toBe(0)
      if (lv.length >= 5) expect(lv.at(-2), `${from}>${to} gone before the end`).toBe(0)
      for (let i = 1; i < lv.length; i++) expect(lv[i]!, `${from}>${to} ${i}`).toBeLessThanOrEqual(lv[i - 1]!)
    }
    for (const key of ['typing>running', 'running>typing']) {
      const [from, to] = key.split('>') as [StateId, StateId]
      const fr = moveFrames(from, to)!.frames
      expect(fr.length).toBeGreaterThanOrEqual(4)
      expect(fr.some(f => f.eyes === 'blink' || f.eyes === 'wide'), key).toBe(false)
      expect(fr.every(f => f.laptop === 1), key).toBe(true)
    }
  })
  test('the code only lives while his laptop is open: it starts after the laptop opens and is gone before it closes', () => {
    for (const other of STATE_IDS) {
      if (other === 'running' || other === 'cold') continue
      const into = moveFrames(other, 'running')!.frames
      const opened = into.findIndex((f, i) => f.laptop !== undefined && into.slice(i).every(g => g.laptop !== undefined))
      into.forEach((f, i) => { if (f.code !== undefined && i < into.length - 1) expect(i, `${other}>running frame ${i}`).toBeGreaterThan(opened) })
      expect(into.filter(f => f.code !== undefined).length, `${other}>running`).toBeGreaterThanOrEqual(3)
      const out = moveFrames('running', other)!.frames
      const closes = out.findIndex((f, i) => i > 0 && f.laptop === undefined)
      out.forEach((f, i) => { if (f.code !== undefined) expect(i, `running>${other} frame ${i}`).toBeLessThan(closes < 0 ? out.length : closes - 1) })
      expect(out.filter((f, i) => i > 0 && f.code !== undefined).length, `running>${other}`).toBeGreaterThanOrEqual(closes < 0 ? 0 : 2)
    }
  })
  test('hovering says what he is doing, and he has nothing to say beyond that (no bubble, like typing)', () => {
    expect(hoverHint('running')).toBe('Running a command')
    expect(bubbleFor('running', { ctxPercent: 10, ctxText: '', cacheLabel: '', fiveUsed: 10, fiveReset: '', weekPace: '', weekRoom: 10, saverOn: false, detail: 'x', savedUsd: '', hasAdvice: false })).toBeNull()
  })
  test('the drawing and its moves fit the Svg limit', () => {
    expect(stateMarkup('running').markup.length).toBeLessThan(131_000)
    for (const to of ['typing', 'building', 'ship', 'idle'] as const) {
      expect(moveMarkup('running', to)!.markup.length, `running>${to}`).toBeLessThan(131_000)
      expect(enterMarkup('running', to)!.markup.length, `running>${to}`).toBeLessThan(131_000)
      expect(enterMarkup(to, 'running')!.markup.length, `${to}>running`).toBeLessThan(131_000)
    }
  })
})
