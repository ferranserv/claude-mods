import { describe, expect, test } from 'claude-code/testing'

import { CELL, alertsOf, bandParts, attentionOf, cockpitSvg, fitLines, model, pillSvg, speechSvg, wandSvg } from './lib'
import { stateMarkup } from './states'

const NOW = new Date(2026, 9, 21, 12).getTime() // a Wednesday: 60% of the week is allotted
const m = (percent: number, five = 0, week = 0) =>
  model({ fill: { tokens: percent * 10, window: 1000, percent }, limits: [{ kind: 'five_hour', percentUsed: five, resetsAt: new Date(NOW + 134 * 60_000).toISOString() }, { kind: 'seven_day', percentUsed: week }], now: NOW })

describe('attentionOf', () => {
  test('calm is 0, a warning 1, an alert 2', () => {
    expect(attentionOf(m(10), false, NOW)).toBe(0)
    expect(attentionOf(m(60), false, NOW)).toBe(1)
    expect(attentionOf(m(90), false, NOW)).toBe(2)
    expect(attentionOf(m(10, 100), false, NOW)).toBe(2)
  })
  test('five-hour at 80%, a week ahead of pace and a preflight finding each warn', () => {
    expect(attentionOf(m(10, 80), false, NOW)).toBe(1)
    expect(attentionOf(m(10, 0, 70), false, NOW)).toBe(1)
    expect(attentionOf(m(10), true, NOW)).toBe(1)
  })
})

describe('alertsOf: every warning has an action', () => {
  const ids = (a: ReturnType<typeof alertsOf>) => a.map(x => x.id)
  test('context warns with handoff, copy and fresh', () => {
    const a = alertsOf(m(60), { saverOn: true, now: NOW })
    expect(ids(a)).toEqual(['ctx'])
    expect(a[0]?.actions).toEqual(['handoff', 'compact', 'copy', 'fresh'])
  })
  test('five-hour and week offer the saver, and are dropped when it is already on', () => {
    expect(alertsOf(m(10, 85), { saverOn: false, now: NOW }).map(x => x.actions)).toEqual([['saverOn']])
    expect(alertsOf(m(10, 85), { saverOn: true, now: NOW })).toEqual([])
    expect(alertsOf(m(10, 0, 70), { saverOn: false, now: NOW }).map(x => x.actions)).toEqual([['saverOn']])
    expect(alertsOf(m(10, 0, 70), { saverOn: true, now: NOW })).toEqual([])
  })
  test('five-hour reached offers a copy of the handoff even with the saver on', () => {
    expect(alertsOf(m(10, 100), { saverOn: true, now: NOW }).map(x => x.actions)).toEqual([['copy']])
  })
  test('calm has nothing', () => {
    expect(alertsOf(m(10), { saverOn: false, now: NOW })).toEqual([])
  })
})

describe('cockpitSvg', () => {
  const mascot = stateMarkup('idle')
  const draw = (w: number, model_: ReturnType<typeof m>) => cockpitSvg(w, model_, mascot)
  test('it is one drawing, as tall as the mascot, whatever the context says', () => {
    const calmDraw = draw(800, m(10, 41, 35))
    expect(calmDraw.height).toBe(mascot.height)
    expect(calmDraw.source).not.toContain('NaN')
  })
  test('the 5-hour bar says when it resets, the weekly bar its usage and its difference', () => {
    const src = draw(900, m(10, 41, 35)).source
    expect(src).toContain('Resets at')
    expect(src).toContain('35% used')
    expect(src).toContain('25% under')
  })
  test('narrow windows keep every number, with short labels', () => {
    const src = draw(380, m(10, 41, 35)).source
    expect(src).toContain('>Ctx<')
    expect(src).toContain('>5h<')
    expect(src).toContain('Resets 14:14')
    expect(src).toContain('Wed 25% under')
  })
  test('the mascot loop animates by swapping frames', () => {
    expect(mascot.markup).toContain('attributeName="opacity"')
    expect(mascot.markup).toContain('repeatCount="indefinite"')
  })
})

describe('wandSvg', () => {
  test('a flat drawing in the cockpit gray, dimmer when there is no draft', () => {
    const on = wandSvg(false).source
    expect(on).toContain('#8E8E93')
    expect(on.match(/#[0-9a-fA-F]{6}/g)?.every(c => c.toLowerCase() === '#8e8e93')).toBe(true)
    expect(wandSvg(false).width).toBe(18)
    expect(on).toContain('M6 3V9') // a small sparkle apart from the wand
    expect(on).not.toContain('Gradient')
    expect(wandSvg(true).source).toContain('fill-opacity="0.45"')
  })
})

describe('the speech bubble', () => {
  test('it is its own drawing: cockpit gray, a stepped shadow, it materializes, and it fits the room it is given', () => {
    const b = speechSvg('Needs your OK', 400)
    expect(b.source).toContain('Needs your OK')
    expect(b.source).toContain('font-weight="400"')
    expect(b.source).toContain('#8E8E93')
    expect(b.source).not.toContain('#ffffff')
    expect((b.source.match(/fill-opacity="0.07"/g) ?? []).length).toBe(8)
    expect(b.source).not.toContain('<filter')
    expect(b.source).toContain('attributeName="opacity" from="0" to="1"')
    expect(b.source).toContain('type="scale" values="0.55;1.06;1"')
  })
  test('text is escaped', () => {
    expect(speechSvg('a < b & c', 400).source).toContain('a &lt; b &amp; c')
  })
  test('the band keeps one height whatever the context says: a warning never adds lines', () => {
    const mascot = { markup: '<g/>', width: 68, height: 56 }
    expect(cockpitSvg(600, m(10), mascot).height).toBe(cockpitSvg(600, m(90), mascot).height)
  })
})

describe('text always fits', () => {
  test('a short text is one line; a long one wraps to two that fit; a very long one ends in an ellipsis', () => {
    expect(fitLines('Done.', 300).lines).toEqual(['Done.'])
    const two = fitLines('Cache is cold: the next message pays full price', 220)
    expect(two.lines.length).toBe(2)
    expect(two.width).toBeLessThanOrEqual(220)
    const cut = fitLines('word '.repeat(80).trim(), 200)
    expect(cut.lines.length).toBe(2)
    expect(cut.lines[1]?.endsWith('…')).toBe(true)
    expect(cut.width).toBeLessThanOrEqual(200)
  })
  test('one unbroken word longer than the room is cut, not run past the edge', () => {
    const r = fitLines('x'.repeat(200), 150)
    expect(r.width).toBeLessThanOrEqual(150)
  })
  test('the bubble drawing never exceeds the room it was given, and grows taller for a second line', () => {
    const one = speechSvg('Needs your OK', 400)
    const two = speechSvg('Cache is cold: the next message pays full price', 250)
    expect(two.width).toBeLessThanOrEqual(250 + 14)
    expect(two.height).toBeGreaterThan(one.height)
    expect(two.source).toContain('Cache is cold: the next')
  })
  test('a button is gray with dark text, whole cells wide and one row tall, so the Button over it covers exactly it', () => {
    const p = pillSvg('Handoff')
    expect(p.width).toBe(p.cols * CELL.w)
    expect(p.height).toBe(CELL.h)
    expect(p.source).toContain('#8E8E93')
    expect(p.source).toContain('>Handoff<')
    expect(p.source).not.toContain('fill-opacity')
    expect(pillSvg('a < b').source).toContain('a &lt; b')
  })
})

describe('no blinking', () => {
  test('Clawd and the meters are separate drawings, and the meters do not depend on the pose', () => {
    const a = bandParts(800, m(10, 41, 35), stateMarkup('idle'))
    const b = bandParts(800, m(10, 41, 35), stateMarkup('typing'))
    expect(a.mascot?.source).not.toBe(b.mascot?.source)
    expect(a.meters.source).toBe(b.meters.source)
    expect(a.mascot?.source).not.toContain('Context')
    expect(bandParts(800, m(10, 41, 35), { markup: '', width: 0, height: 0 }).mascot).toBeNull()
  })
  test('one bubble giving way to another is one drawing that starts as the old one: delete, resize, type', () => {
    const fresh = speechSvg('Done.', 400)
    expect(fresh.source).toContain('from="0" to="1"') // materializes only when nothing was there
    const t = speechSvg('Cache is cold', 400, 'Done.')
    expect(t.source).toContain('>Done.<') // the first frame is the old bubble...
    expect(t.source).toContain('>Cache is cold<') // ...the new words wait behind a clip that opens letter by letter
    expect(t.source).toContain('calcMode="discrete"')
    expect(t.source).toContain('clip-path="url(#cko)"')
    expect(t.source).toContain('clip-path="url(#ckn)"')
    expect(t.source).not.toContain('NaN')
    const wide = speechSvg('A much longer sentence than the first', 400, 'Done.')
    expect(wide.source).toMatch(/<animate attributeName="width" from="\d+" to="\d+"/) // the bubble is resized, not replaced
    expect(wide.width).toBeGreaterThan(speechSvg('Done.', 400).width) // and the drawing is as wide as the wider of the two
  })
})
