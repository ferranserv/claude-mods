import { describe, expect, test } from 'claude-code/testing'

import { COFFEE_AFTER_MS, bubbleFor, clockOf, pickState } from './mood'
import type { BubbleInput, MoodInput } from './mood'
import { STATES, STATE_IDS, stateMarkup } from './states'
import { pixelsOutside } from './sprite'

const NOW = 1_000_000
const calm: MoodInput = {
  now: NOW, waiting: false, fleet: {}, compacting: false, tool: null, walkUntil: 0, helloUntil: 0,
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
  test('29 states, each with a terminal face', () => {
    expect(STATE_IDS.length).toBe(29)
    for (const id of STATE_IDS) expect(STATES[id].face.length).toBeGreaterThan(2)
  })
  test('the alarm clock shows the wake-up time it is given', () => {
    expect(stateMarkup('asleep', '14:20').markup).not.toBe(stateMarkup('asleep', '09:05').markup)
    expect(stateMarkup('asleep', '14:20').width).toBe(112)
  })
  test('animated states swap frames; the frozen state does not move', () => {
    expect(stateMarkup('typing').markup).toContain('attributeName="opacity"')
    expect(stateMarkup('cold').markup).not.toContain('<animate')
    expect(stateMarkup('walk').markup).toContain('animateTransform')
  })
})
