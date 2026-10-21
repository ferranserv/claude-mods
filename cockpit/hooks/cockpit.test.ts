import { describe, expect, test } from 'claude-code/testing'

import { CELL, LANE_H, alertsOf, attentionOf, bandParts, bubbleArt, bubbleTextWidth, bubbleWidth, cockpitSvg, fitText, model, PILL_GAP, pillGroupSvg, textPx, wandSvg } from './lib'
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
    expect(a[0]?.actions).toEqual(['copy', 'handoff', 'compact', 'fresh'])
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
  test('it is drawn in a lane two rows tall (like the buttons), cockpit gray with a black stepped border, a tail to Clawd and no shadow', () => {
    const b = bubbleArt('Done.', 'Waiting for your answer', 400)
    expect(b.height).toBe(LANE_H)
    expect(b.source).toContain('#8E8E93')
    expect(b.source).toContain('#0b0705')
    expect(b.source).not.toContain('fill-opacity') // no shadow
    expect(b.source).not.toContain('<filter')
    expect(b.source).not.toContain('NaN')
    expect(bubbleArt('Done.', 'Done.', 400).source).not.toContain('<animate') // the same words twice: a still drawing
  })
  test('it fits its words: as wide as they are, padding either side, letters never squashed', () => {
    const still = (t: string) => bubbleArt(t, t, 600)
    const widthOf = (t: string) => Number(/<rect x="10" y="2" width="(\d+)"/.exec(still(t).source)?.[1])
    expect(widthOf('Done.')).toBe(bubbleTextWidth('Done.') + 24 - 4) // the border block, inside the stepped corners; 12 px of padding each side
    expect(widthOf('A much longer sentence than the first')).toBeGreaterThan(widthOf('Done.'))
    expect(still('Done.').source).toContain('lengthAdjust="spacing"') // only the space between letters is fitted, the letters keep their shape
    expect(still('Done.').source).not.toContain('spacingAndGlyphs')
  })
  test('the width counted follows the letters: narrow ones take less than wide ones', () => {
    expect(bubbleTextWidth('iiiiiiiiii')).toBeLessThan(bubbleTextWidth('mmmmmmmmmm'))
    expect(bubbleTextWidth('IIII')).toBeLessThan(bubbleTextWidth('WWWW'))
  })
  test('it takes all the room it has up to its buttons, and no more than its words need', () => {
    expect(bubbleWidth('Done.', 600)).toBeLessThan(bubbleWidth('A sentence that needs a good deal more room than that', 600))
    expect(bubbleWidth('A sentence that needs a good deal more room than that', 200)).toBeLessThanOrEqual(200)
    expect(bubbleWidth('A sentence that needs a good deal more room than that', 800)).toBeGreaterThan(bubbleWidth('A sentence that needs a good deal more room than that', 200))
  })
  test('text is escaped, and a text that cannot fit ends in an ellipsis', () => {
    expect(bubbleArt('a < b & c', 'a < b & c', 400).source).toContain('a &lt; b &amp; c')
    const cut = fitText('x'.repeat(200), 150)
    expect(cut.endsWith('…')).toBe(true)
    expect(bubbleTextWidth(cut)).toBeLessThanOrEqual(150)
    expect(fitText('Done.', 150)).toBe('Done.')
  })
  test('opening scales out of Clawd while the words are typed; closing deletes them and scales back; changing deletes (the bubble shortens), types (it lengthens)', () => {
    const open = bubbleArt('', 'Done.', 400)
    expect(open.source).toContain('opacity="0"')
    expect(open.source).toContain('type="scale" values="0.5;1.06;1"')
    expect(open.source).toContain('calcMode="discrete"')
    expect(open.source).toContain('clip-path="url(#ckn)"')
    expect(open.source).not.toContain('clip-path="url(#cko)"')
    const close = bubbleArt('Done.', '', 400)
    expect(close.source).toContain('clip-path="url(#cko)"')
    expect(close.source).toContain('type="scale" values="1;0.5"')
    expect(close.source).toContain('from="1" to="0"')
    const change = bubbleArt('Done.', 'Waiting for your answer', 400)
    expect(change.source).toContain('>Done.<') // it starts as the old bubble...
    expect(change.source).toContain('>Waiting for your answer<')
    expect(change.source).toContain('clip-path="url(#cko)"')
    expect(change.source).toContain('clip-path="url(#ckn)"')
    expect(change.source).toMatch(/<animate attributeName="width" values="[\d;]+" keyTimes="[\d.;]+" calcMode="discrete"/) // ...and the bubble shortens with the letters, then lengthens with the new ones: one drawing written over
    expect(change.source).not.toContain('type="scale"') // no pop between two bubbles
    expect(change.seconds).toBeGreaterThan(open.seconds * 0 + 0.3)
  })
  test('the frame is the same width whatever the words, so the buttons beside it never move', () => {
    expect(bubbleArt('', 'Done.', 400).width).toBe(bubbleArt('Done.', 'A much longer sentence than the first one', 400).width)
  })
  test('the band keeps one height whatever the context says: a warning never adds lines', () => {
    const mascot = { markup: '<g/>', width: 68, height: 56 }
    expect(cockpitSvg(600, m(10), mascot).height).toBe(cockpitSvg(600, m(90), mascot).height)
  })
})

describe('the buttons are one picture', () => {
  test('pills in the bubble gray, dark text, as tall as the bubble, a gap between, all in one drawing', () => {
    const g = pillGroupSvg(['Copy handoff', '…'])
    expect(g.parts.length).toBe(2)
    expect(g.parts[1]!.x).toBe(g.parts[0]!.w + PILL_GAP)
    expect(g.width).toBe(g.parts[1]!.x + g.parts[1]!.w)
    expect(g.height).toBe(26)
    expect(g.source).toContain('#8E8E93')
    expect(g.source).toContain('>Copy handoff<')
    expect(g.source).not.toContain('fill-opacity')
    expect(pillGroupSvg(['a < b']).source).toContain('a &lt; b')
    expect(pillGroupSvg([]).width).toBe(0)
  })
  test('a pill is as wide as its label needs, never narrower than a small button', () => {
    expect(pillGroupSvg(['Copy handoff']).width).toBeGreaterThan(pillGroupSvg(['OK']).width)
    expect(pillGroupSvg(['…']).width).toBeGreaterThanOrEqual(34)
    expect(pillGroupSvg(['Handoff']).parts[0]!.w).toBeGreaterThanOrEqual(textPx('Handoff', 12) + 24)
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
})
