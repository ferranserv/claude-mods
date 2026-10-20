import { describe, expect, test } from 'claude-code/testing'

import { alertsOf, attentionOf, cockpitSvg, model } from './lib'
import { stateMarkup } from './states'

const NOW = new Date(2026, 9, 21, 12).getTime() // a Wednesday: 60% of the week is allotted
const m = (percent: number, five = 0, week = 0) =>
  model({ fill: { tokens: percent * 10, window: 1000, percent }, limits: [{ kind: 'five_hour', percentUsed: five }, { kind: 'seven_day', percentUsed: week }], now: NOW })

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
  test('the collapsed row is as tall as the mascot and keeps the small print out', () => {
    const closed = cockpitSvg(800, m(60, 41, 35), mascot, false)
    expect(closed.height).toBe(mascot.height)
    expect(closed.source).not.toContain('quality may start to slip')
    expect(closed.source).not.toContain('NaN')
  })
  test('opened it carries the warning text', () => {
    const open = cockpitSvg(1200, m(60, 41, 35), mascot, true)
    expect(open.source).toContain('quality may start to slip')
    expect(open.source).not.toContain('NaN')
  })
  test('the mascot loop animates by swapping frames', () => {
    expect(mascot.markup).toContain('attributeName="opacity"')
    expect(mascot.markup).toContain('repeatCount="indefinite"')
  })
})
