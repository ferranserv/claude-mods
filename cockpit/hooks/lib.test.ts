import { describe, expect, test } from 'claude-code/testing'

import {
  CACHE_INITIAL,
  DAYS,
  allottedThrough,
  bandSvg,
  bandWidth,
  cacheView,
  cells,
  clockText,
  dividerSvg,
  kilo,
  learnWindow,
  legendFor,
  legendLines,
  levelOf,
  line,
  model,
  money,
  nextCost,
  pace,
  priceOf,
  resetShort,
  sideSvg,
  sliceFrac,
  usageColor,
  weekColor,
  windowMinutes,
  workday,
  wrapLines,
} from './lib'
import type { CacheState, Data } from './lib'

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

describe('legendFor and levels', () => {
  test('calm below 50 percent and 150k tokens', () => {
    expect(levelOf(49, 100_000)).toBe('calm')
    expect(legendFor(20, 40_000).tone).toBe('calm')
  })
  test('first warning at 50 percent, whatever the token count', () => {
    expect(levelOf(50, 10)).toBe('warn')
    const l = legendFor(52, 10)
    expect(l.tone).toBe('warn')
    expect(l.text).toContain('52%')
    expect(l.text).toContain('quality')
  })
  test('warns at 150k tokens even when percent is low (a 1M window)', () => {
    expect(levelOf(15, 149_999)).toBe('calm')
    const l = legendFor(15, 150_000)
    expect(l.tone).toBe('warn')
    expect(l.text).toContain('150k')
  })
  test('alert only past 80 percent', () => {
    expect(levelOf(80, 10)).toBe('warn')
    expect(levelOf(81, 10)).toBe('alert')
    expect(legendFor(81, 10).text).toContain('Hand off')
  })
  test('thresholds can be changed', () => {
    const t = { warnPercent: 30, redPercent: 60, warnTokens: 50_000 }
    expect(levelOf(30, 0, t)).toBe('warn')
    expect(levelOf(61, 0, t)).toBe('alert')
    expect(levelOf(10, 50_000, t)).toBe('warn')
    expect(legendFor(10, 0, t).text).toContain('30%')
  })
  test('every message has a short form', () => {
    for (const [p, tk] of [[10, 10], [55, 10], [10, 200_000], [90, 10]] as const) {
      const l = legendFor(p, tk)
      expect(l.short.length).toBeLessThan(l.text.length + 1)
      expect(l.short.length).toBeLessThanOrEqual(36)
    }
  })
})

describe('legend wrapping', () => {
  test('wrapLines breaks on words and refuses what will not fit', () => {
    expect(wrapLines('one two three', 1000, 9, 2)).toEqual(['one two three'])
    expect(wrapLines('aaaa bbbb cccc dddd', 5 * 9 * 0.54 * 1.01, 9, 2)).toBeNull()
    expect(wrapLines('x'.repeat(200), 100, 9, 2)).toBeNull()
  })
  test('a wide column shows the whole message, never an ellipsis', () => {
    const l = legendFor(55, 10)
    const lines = legendLines(l, 230, 9, 2)
    expect(lines.join(' ')).toBe(l.text)
    expect(lines.join('')).not.toContain('…')
  })
  test('a narrow column falls back to the short message, and only then clips', () => {
    const l = legendFor(55, 10)
    expect(legendLines(l, 110, 9, 2).join(' ')).toBe(l.short)
    const tiny = legendLines(l, 40, 9, 2)
    expect(tiny.length).toBe(1)
    expect(tiny[0]?.endsWith('…')).toBe(true)
  })
})

describe('model', () => {
  test('no data shows dashes and does not throw', () => {
    const m = model({ fill: null, limits: [], now: WED })
    expect(m.ctx.percent).toBe(0)
    expect(m.five.sub).toContain('after the first reply')
    expect(m.week.value[0]?.[0]?.t).toBe('-')
  })

  test('context bar: blue, orange from 50, red past 80', () => {
    // small windows, so the token count stays under 150k and only the percent speaks
    const at = (percent: number) => model({ ...data(), fill: { tokens: percent * 1000, window: 100_000, percent } }).ctx.color
    const blue = at(10)
    const orange = at(50)
    const red = at(81)
    expect(at(49)).toBe(blue)
    expect(orange).not.toBe(blue)
    expect(at(80)).toBe(orange)
    expect(red).not.toBe(orange)
    expect(red).not.toBe(blue)
  })

  test('five-hour reset text and weekly pace text', () => {
    const m = model(data(30, 40, 35))
    expect(m.five.sub).toBe('Resets at 14:14 (in 2h 14m)')
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
      .map(t => ({ tag: t, body: source.split(t)[1]?.split('</text>')[0] ?? '' }))
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
    expect(bandWidth(10)).toBe(320)
    expect(bandWidth(1000)).toBe(1600)
    expect(bandWidth(100)).toBe(800)
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
    expect(line(model(data(10))).map(s => s.t).join('')).not.toContain('quality')
    const big = { ...data(15), fill: { tokens: 160_000, window: 1_000_000, percent: 16 } }
    expect(line(model(big)).map(s => s.t).join('')).toContain('quality may slip')
    expect(line(model(data(55))).map(s => s.t).join('')).toContain('quality may slip')
    expect(line(model(data(90))).map(s => s.t).join('')).toContain('hand off now')
  })

  test('bar cells total the bar width', () => {
    const segs = line(model(data(50, 50, 50)), 8)
    const bars = segs.filter(s => /^━+$/.test(s.t))
    expect(bars.map(s => s.t.length).reduce((a, b) => a + b, 0)).toBe(24)
    const withCache = line(model({ ...data(50, 50, 50), cache: { state: { ...CACHE_INITIAL, lastAt: WED - 10 * MIN }, price: null } }))
    expect(withCache.filter(s => /^━+$/.test(s.t)).map(s => s.t.length).reduce((a, b) => a + b, 0)).toBe(24)
  })
})

describe('prompt cache', () => {
  const at = (over: Partial<CacheState> = {}): CacheState => ({ ...CACHE_INITIAL, ...over })

  test('window: your setting beats what was learned beats the 60-minute default', () => {
    expect(windowMinutes(at())).toBe(60)
    expect(windowMinutes(at({ detected: 5 }))).toBe(5)
    expect(windowMinutes(at({ detected: 5, override: 30 }))).toBe(30)
  })

  test('learning: a hit after more than five idle minutes proves the one-hour cache', () => {
    const hit = { input: 100, read: 90_000, create: 0 }
    expect(learnWindow(at(), 20 * MIN, hit).detected).toBe(60)
    expect(learnWindow(at(), 2 * MIN, hit).detected).toBeNull()
  })

  test('learning: two full misses inside the hour mean the five-minute cache; one is not enough', () => {
    const miss = { input: 100, read: 0, create: 90_000 }
    const once = learnWindow(at(), 20 * MIN, miss)
    expect(once.detected).toBeNull()
    expect(once.misses).toBe(1)
    expect(learnWindow(once, 20 * MIN, miss).detected).toBe(5)
  })

  test('learning: a proven hour is never undone by a miss, and a miss after an hour proves nothing', () => {
    const miss = { input: 100, read: 0, create: 90_000 }
    expect(learnWindow(at({ detected: 60 }), 20 * MIN, miss).detected).toBe(60)
    expect(learnWindow(at({ misses: 1 }), 90 * MIN, miss).detected).toBeNull()
    expect(learnWindow(at(), 20 * MIN, { input: 0, read: 0, create: 0 })).toEqual(at())
  })

  test('a hit resets the miss count', () => {
    const c = learnWindow(at({ misses: 1 }), 20 * MIN, { input: 1, read: 5_000, create: 0 })
    expect(c.misses).toBe(0)
  })

  test('view: unknown, warm, soon (last five minutes), cold', () => {
    const c = at({ lastAt: WED })
    expect(cacheView(at(), WED, 0, null).state).toBe('unknown')
    expect(cacheView(c, WED + 10 * MIN, 0, null).state).toBe('warm')
    expect(cacheView(c, WED + 56 * MIN, 0, null).state).toBe('soon')
    expect(cacheView(c, WED + 60 * MIN, 0, null).state).toBe('cold')
    expect(cacheView(c, WED + 61 * MIN, 0, null).label).toBe('cold')
    const v = cacheView(c, WED + 30 * MIN, 0, null)
    expect(v.label).toBe('30m')
    expect(Math.abs(v.frac - 0.5)).toBeLessThan(1e-9)
  })

  test('view: on a five-minute cache "soon" is capped at half the window', () => {
    const c = at({ lastAt: WED, detected: 5 })
    expect(cacheView(c, WED + 60_000, 0, null).state).toBe('warm')
    expect(cacheView(c, WED + 2.6 * MIN, 0, null).state).toBe('soon')
  })

  test('the countdown moves in five-minute steps, rounding up, then reads <5m', () => {
    const c = at({ lastAt: WED })
    const label = (min: number, step?: number) => cacheView(c, WED + min * MIN, 0, null, 5, step).label
    expect(label(0)).toBe('60m')
    expect(label(0.5)).toBe('60m')
    expect(label(2.1)).toBe('60m')
    expect(label(5)).toBe('55m')
    expect(label(5.01)).toBe('55m')
    expect(label(10.01)).toBe('50m')
    expect(label(54.9)).toBe('10m')
    expect(label(55.1)).toBe('<5m')
    expect(label(59.9)).toBe('<5m')
    expect(label(3, 1)).toBe('57m')
    expect(label(59.5, 1)).toBe('<1m')
  })

  test('a 30-minute window reads 30m right after a message, and never more than the window', () => {
    const c = at({ lastAt: WED, override: 30 })
    expect(cacheView(c, WED + 0.4 * MIN, 0, null).label).toBe('30m')
    expect(cacheView(at({ lastAt: WED, override: 7 }), WED + 0.1 * MIN, 0, null).label).toBe('7m')
  })

  test('the bar moves with the steps, not between them; exact time is still available', () => {
    const c = at({ lastAt: WED })
    const a = cacheView(c, WED + 6 * MIN, 0, null)
    const b = cacheView(c, WED + 9 * MIN, 0, null)
    expect(a.frac).toBe(b.frac)
    expect(Math.abs(a.frac - 55 / 60)).toBeLessThan(1e-9)
    expect(Math.abs(b.leftMs - 51 * MIN)).toBeLessThan(1)
  })

  test('clock text', () => {
    expect(clockText(0)).toBe('0:00')
    expect(clockText(65_000)).toBe('1:05')
    expect(clockText(42 * MIN + 10_000)).toBe('42:10')
    expect(clockText(3_904_000)).toBe('1:05:04')
    expect(clockText(-5)).toBe('0:00')
  })

  test('cost of the next message: cache read warm, cache write cold (1.25x for 5m, 2x for 1h)', () => {
    const price = { input: 2, output: 10 }
    const hour = nextCost(200_000, price, 60)
    expect(Math.abs(hour.warm - 0.04)).toBeLessThan(1e-9)
    expect(Math.abs(hour.cold - 0.8)).toBeLessThan(1e-9)
    expect(Math.abs(nextCost(200_000, price, 5).cold - 0.5)).toBeLessThan(1e-9)
    expect(hour.cold).toBeGreaterThan(hour.warm * 10)
  })

  test('prices by model id', () => {
    expect(priceOf('claude-sonnet-5-5')).toEqual({ input: 2, output: 10 })
    expect(priceOf('claude-haiku-5-5')?.input).toBe(0.1)
    expect(priceOf('something-else')).toBeNull()
    expect(money(0.04)).toBe('$0.04')
    expect(money(0.004)).toBe('$0.0040')
  })

  test('model: cache meter with costs, or with only the window when the price is unknown', () => {
    const state = at({ lastAt: WED - 18 * MIN })
    const priced = model({ ...data(20), cache: { state, price: { input: 2, output: 10 } } })
    expect(priced.cache?.view.label).toBe('45m')
    expect(priced.cache?.sub).toContain('Next msg $0.04')
    expect(priced.cache?.sub).toContain('cold $0.80')
    const unpriced = model({ ...data(20), cache: { state, price: null } })
    expect(unpriced.cache?.sub).toContain('window')
    expect(model(data(20)).cache).toBeUndefined()
  })
})

describe('band with the cache meter', () => {
  const withCache = (d: Data, state: CacheState): Data => ({ ...d, cache: { state, price: { input: 2, output: 10 } } })
  const warm = { ...CACHE_INITIAL, lastAt: WED - 18 * MIN }

  test('four columns: seven track bars become eight, and everything stays on the canvas', () => {
    for (const cols of [60, 100, 140, 200]) {
      const { source, width } = bandSvg(bandWidth(cols), model(withCache(data(100, 100, 100), warm)))
      const tracks = tags(source, 'rect').filter(r => r.includes('fill-opacity="0.25"'))
      expect(tracks.length).toBe(8)
      expect(source).not.toContain('NaN')
      for (const r of tags(source, 'rect')) expect(attr(r, 'x') + attr(r, 'width')).toBeLessThanOrEqual(width + 0.1)
    }
  })

  test('the cache fill drains with the time left', () => {
    const half = bandSvg(1000, model(withCache(data(0, 0, 0), { ...CACHE_INITIAL, lastAt: WED - 30 * MIN })))
    const rects = tags(half.source, 'rect')
    const track = rects.filter(r => r.includes('fill-opacity="0.25"'))[7] ?? ''
    const fill = rects.filter(r => !r.includes('fill-opacity="0.25"')).at(-1) ?? ''
    expect(Math.abs(attr(fill, 'width') / attr(track, 'width') - 0.5)).toBeLessThan(0.01)
  })

  test('the cold cache is red text on an empty bar', () => {
    const cold = bandSvg(1000, model(withCache(data(0, 0, 0), { ...CACHE_INITIAL, lastAt: WED - 90 * MIN })))
    expect(cold.source).toContain('>cold<')
  })

  test('the cost text appears only when the cache is about to go cold: in full on a wide band, shortened on a narrow one', () => {
    const soon = { ...CACHE_INITIAL, lastAt: WED - 57 * MIN }
    expect(bandSvg(1200, model(withCache(data(), warm))).source).not.toContain('Next msg $')
    const wide = bandSvg(1200, model(withCache(data(), soon))).source
    expect(wide).toContain('Next msg $')
    const narrow = bandSvg(380, model(withCache(data(), soon))).source
    expect(narrow).not.toContain('Next msg $')
  })

  test('side panel with the cache column has no NaN and five weekly slots', () => {
    const { source } = sideSvg(210, model(withCache(data(), warm)))
    expect(source).not.toContain('NaN')
    // context + 5-hour + five weekly slots + cache
    expect(tags(source, 'rect').filter(r => r.includes('fill-opacity="0.25"')).length).toBe(8)
  })

  test('divider is a single hairline', () => {
    const d = dividerSvg(600)
    expect(d.source.match(/<rect/g)?.length).toBe(1)
    expect(d.height).toBeGreaterThan(8)
  })
})
