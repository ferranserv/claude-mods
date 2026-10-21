import { describe, expect, test } from 'claude-code/testing'

import { COFFEE_AFTER_MS, bubbleFor, clockOf, pickState } from './mood'
import type { BubbleInput, MoodInput } from './mood'
import type { StateId } from './states'
import { MOVES, STATES, STATE_IDS, enterMarkup, moveFrames, moveMarkup, moveMs, stateMarkup } from './states'
import { pixelsOutside } from './sprite'

const NOW = 1_000_000
const calm: MoodInput = {
  now: NOW, waiting: false, writing: false, fleet: {}, compacting: false, tool: null, walkUntil: 0, helloUntil: 0,
  ctx: 'calm', cache: 'warm', fiveUsed: 10, weekRoom: 30, hasAdvice: false, hasNote: false, busy: false, busyMs: 0, hasTool: false,
}
const mood = (o: Partial<MoodInput>) => pickState({ ...calm, ...o })

describe('which state wins', () => {
  test('nothing going on: idle', () => expect(mood({})).toBe('idle'))

  test('a permission prompt beats everything, even a fleeting event', () => {
    expect(mood({ waiting: true, fleet: { oops: NOW + 1000 }, fiveUsed: 100 })).toBe('hand')
  })

  test('fleeting events beat lasting warnings, and the warning returns when they end', () => {
    const lasting = { ctx: 'alert' as const, fiveUsed: 100, weekRoom: -5 }
    expect(mood({ ...lasting, fleet: { bell: NOW + 2000 } })).toBe('bell')
    expect(mood({ ...lasting, fleet: { bell: NOW - 1 } })).toBe('asleep')
  })

  test('among fleeting events the order is oops, bell, lab, love, idea, wand, coins, plug', () => {
    const all = { oops: NOW + 1, bell: NOW + 1, lab: NOW + 1, love: NOW + 1, idea: NOW + 1, wand: NOW + 1, coins: NOW + 1, plug: NOW + 1 }
    const order = ['oops', 'bell', 'lab', 'love', 'idea', 'wand', 'coins', 'plug'] as const
    const left: Partial<typeof all> = { ...all }
    for (const id of order) {
      expect(mood({ fleet: left })).toBe(id)
      delete left[id]
    }
    expect(mood({ fleet: left })).toBe('idle')
  })

  test('a tool at work shows over a lasting warning, then the warning returns after the linger', () => {
    expect(mood({ ctx: 'alert', tool: { kind: 'building', until: NOW + 500 } })).toBe('building')
    expect(mood({ ctx: 'alert', tool: { kind: 'building', until: NOW - 1 } })).toBe('fire')
  })

  test('compacting beats a tool', () => {
    expect(mood({ compacting: true, tool: { kind: 'reading', until: NOW + 1 } })).toBe('dizzy')
  })

  test('lasting warnings, worst first', () => {
    expect(mood({ fiveUsed: 100, weekRoom: -1, ctx: 'alert', hasAdvice: true, cache: 'cold' })).toBe('asleep')
    expect(mood({ weekRoom: -1, ctx: 'alert', hasAdvice: true, cache: 'cold' })).toBe('mad')
    expect(mood({ ctx: 'alert', hasAdvice: true, cache: 'cold' })).toBe('fire')
    expect(mood({ hasAdvice: true, cache: 'cold' })).toBe('detective')
    expect(mood({ cache: 'cold', weekRoom: 1, ctx: 'warn' })).toBe('cold')
    expect(mood({ cache: 'soon', weekRoom: 1, ctx: 'warn' })).toBe('hourglass')
    expect(mood({ weekRoom: 1, ctx: 'warn', fiveUsed: 85 })).toBe('gauge')
    expect(mood({ ctx: 'warn', fiveUsed: 85 })).toBe('drunk')
    expect(mood({ fiveUsed: 85 })).toBe('sleepy')
  })

  test('cache states apply only while idle: a running turn keeps the cache warm', () => {
    expect(mood({ cache: 'cold', busy: true })).toBe('thinking')
    expect(mood({ cache: 'soon', busy: true, hasTool: true })).toBe('typing')
  })

  test('working: thinking before any tool, typing after, coffee past two minutes', () => {
    expect(mood({ busy: true })).toBe('thinking')
    expect(mood({ busy: true, hasTool: true })).toBe('typing')
    expect(mood({ busy: true, hasTool: true, busyMs: COFFEE_AFTER_MS + 1 })).toBe('coffee')
  })

  test('session start: walk, then hello, both below a tool and above a warning', () => {
    expect(mood({ walkUntil: NOW + 1, helloUntil: NOW + 1 })).toBe('walk')
    expect(mood({ helloUntil: NOW + 1, ctx: 'alert' })).toBe('hello')
    expect(mood({ walkUntil: NOW + 1, tool: { kind: 'reading', until: NOW + 1 } })).toBe('reading')
  })

  test('a notice with nothing else going on: talk', () => expect(mood({ hasNote: true })).toBe('talk'))
})

describe('the bubble', () => {
  const b: BubbleInput = { ctxPercent: 62, ctxText: 'Quality may start to slip.', cacheLabel: '4m', fiveUsed: 85, fiveReset: '14:20', weekPace: 'Wed 5% over', weekRoom: -5, saverOn: false, detail: 'app.ts', savedUsd: '$0.04', hasAdvice: false }
  test('warnings stand for their alert row and offer the action', () => {
    expect(bubbleFor('fire', b)).toMatchObject({ alertId: 'ctx', action: 'handoff' })
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
  test('30 states, each with a terminal face', () => {
    expect(STATE_IDS.length).toBe(30)
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
      expect(same(f[0]!, STATES[from].frames[0]!), `${key} start`).toBe(true)
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
      if (m.frames.length < 3) continue
      expect(m.frames[0]!.hold, `${key} first`).toBeLessThan(1)
      expect(m.frames[m.frames.length - 1]!.hold, `${key} last`).toBeGreaterThan(1)
      expect(m.frames.slice(1, -1).some(f => f.eyes === 'blink' || (f.eyes !== undefined && f.eyes !== 'open' && f.eyes !== 'half')), `${key} blink or an expressive look in the middle`).toBe(true)
    }
  })
  test('a prop that goes is carried in his hand and put behind him; one that comes is fetched the same way', () => {
    const gone = moveFrames('idle', 'thinking')!.frames
    const carried = gone.filter(f => f.carry === 'shades')
    expect(carried.length).toBeGreaterThanOrEqual(2) // lifted in his hand, then swung out behind him
    expect(carried.some(f => f.at === 1 && f.armR === 'up')).toBe(true)
    expect(carried.some(f => f.at === 3 && f.armR === 'out')).toBe(true)
    expect(carried.every(f => f.shades === undefined)).toBe(true) // it is in his hand, no longer on his face
    const came = moveFrames('bell', 'idle')!.frames
    expect(came.some(f => f.carry === 'shades' && f.at === 3 && f.armR === 'out')).toBe(true) // fetched from behind him
    expect(came.some(f => f.carry === 'bell')).toBe(true) // and the bell was put away first
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
