import { describe, expect, test } from 'claude-code/testing'

import { alertsOf, attentionOf, cockpitSvg, model, pillSvg, wandSvg } from './lib'
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
    expect(a[0]?.actions).toEqual(['handoff', 'copy', 'fresh'])
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
  test('open or collapsed it is one drawing; the row is as tall as the mascot when nothing is near a warning', () => {
    const calmDraw = draw(800, m(10, 41, 35))
    expect(calmDraw.height).toBe(mascot.height)
    expect(calmDraw.source).not.toContain('NaN')
  })
  test('context text under the bar appears only near its warning', () => {
    expect(draw(900, m(10)).source).not.toContain('quality may start to slip')
    expect(draw(900, m(60)).source).toContain('quality may start to slip')
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

describe('the speech bubble in the band', () => {
  const mascot = { markup: '<g/>', width: 68, height: 56 }
  const said = (t: string, phase: 'in' | 'out' = 'in', button: string | null = null) => cockpitSvg(600, m(10), mascot, { text: t, phase, button })
  test('it sits at the foot of the band over the small print, so the band keeps its size', () => {
    const plain = cockpitSvg(600, m(10), mascot)
    const b = said('Needs your OK')
    expect(b.height).toBe(plain.height)
    expect(b.width).toBe(plain.width)
    expect(b.source).toContain('Needs your OK')
    expect(b.source).toContain('font-weight="400"')
    expect(b.source).toContain('#8E8E93') // the cockpit gray inside
    expect(b.source).not.toContain('#ffffff')
    expect(b.bubbleBox!.x).toBeGreaterThan(68)
    expect(b.bubbleBox!.y).toBeGreaterThanOrEqual(22) // low: below the meters' labels (and the bars in any band with room)
    expect(b.bubbleBox!.y + b.bubbleBox!.h).toBeLessThan(b.height) // and clear of the bottom edge
    expect(plain.bubbleBox).toBeNull()
  })
  test('what is behind it is shadowed in the bubble\'s own shape, a few pixels wide, and it materializes', () => {
    const b = said('Needs your OK')
    expect((b.source.match(/fill-opacity="0.07"/g) ?? []).length).toBe(8) // four stepped copies, two rects each
    expect(b.source).not.toContain('<radialGradient') // not a blob behind it
    expect(b.source).not.toContain('<filter')
    const box = b.bubbleBox!
    expect(box.y + box.h + 4).toBeLessThan(b.height) // the 4 px shadow stays inside the band: nothing to cut off
    expect(box.y - 4).toBeGreaterThanOrEqual(0)
    expect(b.source).toContain('attributeName="opacity" from="0" to="1"')
    expect(b.source).toContain('type="scale" values="0.55;1.06;1"') // grows with a small overshoot
    expect(b.source).not.toContain('type="translate"') // it does not pan in from the side
  })
  test('leaving: the same drawing, invisible, shrinking and fading out', () => {
    const b = said('Done.', 'out').source
    expect(b).toContain('opacity="0"><animate attributeName="opacity" from="1" to="0"')
    expect(b).toContain('type="scale" values="1;0.82"')
  })
  test('its button is drawn inside it, and its box is reported so the real button can be laid over it', () => {
    const b = said('Cache is cold', 'in', 'Handoff')
    expect(b.source).toContain('>Handoff<')
    expect(b.buttonBox).not.toBeNull()
    const box = b.bubbleBox!
    const btn = b.buttonBox!
    expect(btn.x).toBeGreaterThan(box.x)
    expect(btn.x + btn.w).toBeLessThanOrEqual(box.x + box.w)
    expect(btn.y).toBeGreaterThanOrEqual(box.y)
    expect(btn.y + btn.h).toBeLessThanOrEqual(box.y + box.h)
    expect(said('Done.').buttonBox).toBeNull()
    expect(said('Done.', 'out', 'Handoff').buttonBox).toBeNull() // nothing to press once it is leaving
  })
  test('text is escaped and the bubble stays inside the band', () => {
    expect(said('a < b & c').source).toContain('a &lt; b &amp; c')
    const wide = said('x'.repeat(200), 'in', 'Handoff')
    expect(wide.bubbleBox!.x + wide.bubbleBox!.w).toBeLessThan(wide.width)
  })
})

describe('pillSvg', () => {
  test('the cockpit gray with dark text, as wide as its columns', () => {
    const p = pillSvg('Handoff')
    expect(p.source).toContain('#8E8E93')
    expect(p.source).toContain('>Handoff<')
    expect(p.width).toBe(p.cols * 8)
    expect(pillSvg('Copy brief').cols).toBeGreaterThan(p.cols)
  })
})
