import { describe, expect, test } from 'claude-code/testing'

import {
  DAYS,
  allottedThrough,
  bandSvg,
  bandWidth,
  cells,
  kilo,
  legendFor,
  line,
  model,
  pace,
  resetShort,
  sideSvg,
  sliceFrac,
  usageColor,
  weekColor,
  workday,
} from './lib'
import type { Data } from './lib'

// Wednesday 12:00 local, so the weekday slots are Mon, Tue done and Wed in progress.
const WED = new Date(2026, 9, 21, 12).getTime()
const SAT = new Date(2026, 9, 24, 12).getTime()
const MIN = 60_000

const data = (percent = 30, five = 40, week = 35, now = WED): Data => ({
  fill: { tokens: percent * 10_000, window: 1_000_000, percent },
  limits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: new Date(now + 134 * MIN).toISOString() },
    { kind: 'seven_day', percentUsed: week },
  ],
  now,
})

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps
const attr = (tag: string, name: string) => Number(new RegExp(`${name}="([-\\d.]+)"`).exec(tag)?.[1])
const tags = (svg: string, name: string) => svg.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []

describe('numbers', () => {
  test('kilo', () => {
    expect(kilo(999)).toBe('999')
    expect(kilo(1500)).toBe('2k')
    expect(kilo(150_000)).toBe('150k')
    expect(kilo(1_000_000)).toBe('1M')
    expect(kilo(1_500_000)).toBe('1.5M')
  })

  test('workday: Mon-Fri map to 0-4, a weekend counts as Friday', () => {
    expect(workday(WED)).toBe(2)
    expect(workday(SAT)).toBe(4)
    expect(workday(new Date(2026, 9, 25, 12).getTime())).toBe(4)
    expect(workday(new Date(2026, 9, 19, 12).getTime())).toBe(0)
  })

  test('pace is measured against what the week has allotted through today', () => {
    expect(allottedThrough(WED)).toBe(60)
    expect(pace(35, WED)).toBe('25% under')
    expect(pace(72, WED)).toBe('12% over')
    expect(pace(60, WED)).toBe('on pace')
  })

  test('sliceFrac fills Monday first and clamps', () => {
    expect(sliceFrac(0, 0)).toBe(0)
    expect(near(sliceFrac(10, 0), 0.5)).toBe(true)
    expect(sliceFrac(10, 1)).toBe(0)
    expect(sliceFrac(30, 0)).toBe(1)
    expect(near(sliceFrac(30, 1), 0.5)).toBe(true)
    expect(sliceFrac(100, 4)).toBe(1)
    expect(sliceFrac(250, 4)).toBe(1)
    expect(sliceFrac(-5, 0)).toBe(0)
  })

  test('resetShort', () => {
    expect(resetShort(undefined, WED)).toBe('')
    expect(resetShort(new Date(WED + 134 * MIN).toISOString(), WED)).toBe('2h 14m')
    expect(resetShort(new Date(WED + 40 * MIN).toISOString(), WED)).toBe('40m')
    expect(resetShort(new Date(WED + (3 * 24 + 2) * 60 * MIN).toISOString(), WED)).toBe('3d 2h')
    expect(resetShort(new Date(WED - MIN).toISOString(), WED)).toBe('now')
    expect(resetShort('not a date', WED)).toBe('now')
  })

  test('cells never shows an empty bar for a non-zero value', () => {
    expect(cells(0, 8)).toBe(0)
    expect(cells(1, 8)).toBe(1)
    expect(cells(100, 8)).toBe(8)
    expect(cells(180, 8)).toBe(8)
  })
})

describe('colors', () => {
  test('5-hour bar: green, orange at 60, red at 85', () => {
    expect(usageColor(59)).toBe(usageColor(0))
    expect(usageColor(60)).not.toBe(usageColor(59))
    expect(usageColor(85)).not.toBe(usageColor(60))
  })

  test('weekly bar: green within the allowance, orange past it, red from 90', () => {
    const within = weekColor(60, WED)
    expect(weekColor(61, WED)).not.toBe(within)
    expect(weekColor(90, WED)).not.toBe(weekColor(61, WED))
  })
})

describe('legendFor', () => {
  test('calm below the thresholds', () => {
    expect(legendFor(20, 40_000).tone).toBe('calm')
  })
  test('warns at 150k tokens even when percent is low', () => {
    const l = legendFor(15, 150_000)
    expect(l.tone).toBe('warn')
    expect(l.text).toContain('150k')
  })
  test('alerts only past 80 percent', () => {
    expect(legendFor(80, 10).tone).not.toBe('alert')
    expect(legendFor(81, 10).tone).toBe('alert')
  })
})

describe('model', () => {
  test('no data shows dashes and does not throw', () => {
    const m = model({ fill: null, limits: [], now: WED })
    expect(m.ctx.percent).toBe(0)
    expect(m.five.sub).toContain('after the first reply')
    expect(m.week.value[0]?.[0]?.t).toBe('-')
  })

  test('context turns red past 80', () => {
    expect(model(data(80)).ctx.color).toBe(model(data(10)).ctx.color)
    expect(model(data(81)).ctx.color).not.toBe(model(data(10)).ctx.color)
  })

  test('five-hour reset text and weekly pace text', () => {
    const m = model(data(30, 40, 35))
    expect(m.five.sub).toBe('Resets in 2h 14m')
    expect(m.week.paceText).toBe('Wed 25% under')
    expect(m.week.today).toBe(2)
  })

  test('a week used 100%+ stays finite', () => {
    const m = model(data(30, 140, 180))
    expect(Number.isFinite(m.five.used)).toBe(true)
    expect(m.week.paceText).toContain('over')
  })
})

describe('bandSvg', () => {
  const states: [string, Data][] = [
    ['normal', data()],
    ['empty', { fill: null, limits: [], now: WED }],
    ['full', data(100, 100, 100)],
    ['weekend', data(30, 40, 35, SAT)],
    ['large context', data(15, 40, 35)],
    ['tokens beyond the window', { ...data(), fill: { tokens: 2_000_000, window: 1_000_000, percent: 200 } }],
  ]

  for (const [name, d] of states) {
    test(`${name}: one root, no NaN, finite size`, () => {
      const { source, width, height } = bandSvg(bandWidth(100), model(d))
      expect(source.startsWith('<svg')).toBe(true)
      expect(source.match(/<svg\b/g)?.length).toBe(1)
      expect(source.match(/<\/svg>/g)?.length).toBe(1)
      expect(source).not.toContain('NaN')
      expect(source).not.toContain('undefined')
      expect(source).not.toContain('Infinity')
      expect(Number.isFinite(width) && Number.isFinite(height)).toBe(true)
      expect(source).toContain(`width="${width}"`)
    })
  }

  test('five weekday slots, each with its day letter centered under it', () => {
    const { source } = bandSvg(bandWidth(100), model(data()))
    const trackRects = tags(source, 'rect').filter(r => r.includes('fill-opacity="0.25"'))
    // 1 context + 1 five-hour + 5 weekly tracks
    expect(trackRects.length).toBe(7)
    const slots = trackRects.slice(2)
    const letters = tags(source, 'text')
      .map((t, i) => ({ tag: t, body: source.split(t)[1]?.split('</text>')[0] ?? '' }))
      .filter(x => x.tag.includes('font-size="10"') && x.tag.includes('text-anchor="middle"'))
    expect(letters.map(l => l.body)).toEqual([...DAYS])
    slots.forEach((slot, i) => {
      const center = attr(slot, 'x') + attr(slot, 'width') / 2
      expect(Math.abs(attr(letters[i]?.tag ?? '', 'x') - center)).toBeLessThan(0.06)
    })
  })

  test('slots are separated by a visible gap', () => {
    const { source } = bandSvg(bandWidth(100), model(data()))
    const slots = tags(source, 'rect').filter(r => r.includes('fill-opacity="0.25"')).slice(2)
    for (let i = 1; i < slots.length; i++) {
      const prev = slots[i - 1] ?? ''
      const gap = attr(slots[i] ?? '', 'x') - (attr(prev, 'x') + attr(prev, 'width'))
      expect(gap).toBeGreaterThanOrEqual(3)
    }
  })

  test('filled part of the week follows the slices, Monday first', () => {
    const { source } = bandSvg(bandWidth(100), model(data(30, 40, 30)))
    const all = tags(source, 'rect')
    const fills = all.filter(r => !r.includes('fill-opacity="0.25"'))
    const slots = all.filter(r => r.includes('fill-opacity="0.25"')).slice(2)
    // 30% = Monday full + Tuesday half; two weekly fills after the context and five-hour fills
    const weekly = fills.slice(2)
    expect(weekly.length).toBe(2)
    expect(near(attr(weekly[0] ?? '', 'width'), attr(slots[0] ?? '', 'width'), 0.1)).toBe(true)
    expect(near(attr(weekly[1] ?? '', 'width'), attr(slots[1] ?? '', 'width') / 2, 0.1)).toBe(true)
    expect(near(attr(weekly[0] ?? '', 'x'), attr(slots[0] ?? '', 'x'), 0.1)).toBe(true)
  })

  test('the today letter is the only bold one', () => {
    const { source } = bandSvg(bandWidth(100), model(data()))
    expect(source.match(/font-weight="700"/g)?.length).toBe(1)
  })

  test('every bar stays inside the canvas', () => {
    const { source, width } = bandSvg(bandWidth(100), model(data(100, 100, 100)))
    for (const r of tags(source, 'rect')) {
      expect(attr(r, 'x') + attr(r, 'width')).toBeLessThanOrEqual(width + 0.1)
    }
  })

  test('escapes markup in text', () => {
    const m = model(data())
    m.five.sub = 'a < b & c'
    expect(bandSvg(bandWidth(100), m).source).toContain('a &lt; b &amp; c')
  })

  test('band width is clamped', () => {
    expect(bandWidth(10)).toBe(300)
    expect(bandWidth(1000)).toBeLessThanOrEqual(1400)
  })
})

describe('sideSvg', () => {
  test('one root, no NaN, five stacked weekday slots with letters beside them', () => {
    for (const d of [data(), { fill: null, limits: [], now: WED }, data(100, 100, 100)]) {
      const { source, width, height } = sideSvg(180, model(d))
      expect(source.match(/<svg\b/g)?.length).toBe(1)
      expect(source).not.toContain('NaN')
      expect(source).not.toContain('undefined')
      expect(width).toBeGreaterThanOrEqual(168)
      expect(height).toBeGreaterThan(0)
    }
    const { source } = sideSvg(180, model(data()))
    const slots = tags(source, 'rect').filter(r => r.includes('fill-opacity="0.25"')).slice(2)
    expect(slots.length).toBe(5)
    // Monday is lowest: y decreases with the weekday index.
    const ys = slots.map(s => attr(s, 'y'))
    expect([...ys].sort((a, b) => b - a)).toEqual(ys)
    // each letter is vertically centered on its slot
    const letters = tags(source, 'text').filter(t => t.includes('font-size="10"') && t.includes('text-anchor="start"'))
    expect(letters.length).toBe(5)
    letters.forEach((t, i) => {
      const slot = slots[i] ?? ''
      const mid = attr(slot, 'y') + attr(slot, 'height') / 2
      expect(Math.abs(attr(t, 'y') - 3.5 - mid)).toBeLessThan(0.1)
    })
  })

  test('bars rise from the bottom', () => {
    const { source } = sideSvg(180, model(data(50, 50, 50)))
    const fills = tags(source, 'rect').filter(r => !r.includes('fill-opacity="0.25"'))
    const ctx = fills[0] ?? ''
    const track = tags(source, 'rect')[0] ?? ''
    expect(near(attr(ctx, 'y') + attr(ctx, 'height'), attr(track, 'y') + attr(track, 'height'), 0.6)).toBe(true)
  })
})

describe('terminal line', () => {
  test('one line: three meters, pace text, no NaN', () => {
    const segs = line(model(data()))
    const text = segs.map(s => s.t).join('')
    expect(text).toContain('Context')
    expect(text).toContain('5h')
    expect(text).toContain('Week')
    expect(text).toContain('Wed 25% under')
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('\n')
  })

  test('shows a short hint when the context is large or nearly full', () => {
    expect(line(model(data(10))).map(s => s.t).join('')).not.toContain('long context')
    const big = { ...data(15), fill: { tokens: 160_000, window: 1_000_000, percent: 16 } }
    expect(line(model(big)).map(s => s.t).join('')).toContain('long context')
    expect(line(model(data(90))).map(s => s.t).join('')).toContain('fresh session')
  })

  test('bar cells total the bar width', () => {
    const segs = line(model(data(50, 50, 50)), 8)
    const bars = segs.filter(s => /^━+$/.test(s.t))
    expect(bars.map(s => s.t.length).reduce((a, b) => a + b, 0)).toBe(24)
  })
})
