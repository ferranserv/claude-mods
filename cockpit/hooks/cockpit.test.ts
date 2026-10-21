import { describe, expect, test } from 'claude-code/testing'

import { alertsOf, attentionOf, cockpitSvg, model, wandSvg, bubbleSvg } from './lib'
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
  test('a flat drawing in one color, white, dimmer when there is no draft', () => {
    const on = wandSvg(false).source
    expect(on).toContain('#ffffff')
    expect(on.match(/#[0-9a-fA-F]{6}/g)?.every(c => c.toLowerCase() === '#ffffff')).toBe(true)
    expect(on).not.toContain('Gradient')
    expect(wandSvg(true).source).toContain('fill-opacity="0.45"')
  })
})

describe('bubbleSvg', () => {
  test('a white pixel bubble with a dark border and regular dark text', () => {
    const b = bubbleSvg('Needs your OK')
    expect(b.source).toContain('fill="#ffffff"')
    expect(b.source).toContain('font-weight="400"')
    expect(b.source).not.toContain('NaN')
    expect(b.height).toBeGreaterThan(26)
    expect(b.width).toBeGreaterThan(60)
  })
  test('text is escaped and the bubble stays inside a sane width', () => {
    expect(bubbleSvg('a < b & c').source).toContain('a &lt; b &amp; c')
    expect(bubbleSvg('x'.repeat(200)).width).toBe(460)
  })
})
