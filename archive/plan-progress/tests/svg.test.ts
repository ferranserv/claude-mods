import { describe, expect, test } from 'claude-code/testing'

import { planSvg } from '../hooks/plan-svg'
import type { PlanView } from '../hooks/plan-svg'

const view = (over: Partial<PlanView> = {}): PlanView => ({
  goal: 'Ship the importer with tests',
  phase: 'building',
  visited: ['researching', 'planning', 'building'],
  isDone: false,
  isRunning: true,
  pct: 50,
  done: 2,
  total: 4,
  elapsed: '4m12s',
  shown: [
    { id: '1', subject: 'Research API', status: 'completed' },
    { id: '2', subject: 'Write schema', status: 'completed' },
    { id: '3', subject: 'Build <importer> & wire', status: 'in_progress' },
    { id: '4', subject: 'Verify', status: 'pending' },
  ],
  hidden: 0,
  ...over,
})

const near = (a: number, b: number, eps = 0.1) => Math.abs(a - b) <= eps
const attr = (tag: string, name: string) => Number(new RegExp(`${name}="([-\\d.]+)"`).exec(tag)?.[1])
const rects = (s: string) => s.match(/<rect\b[^>]*>/g) ?? []

describe('planSvg', () => {
  test('one root, finite size, no NaN, text escaped', () => {
    const { source, width, height } = planSvg(700, view())
    expect(source.match(/<svg\b/g)?.length).toBe(1)
    expect(source).not.toContain('NaN')
    expect(source).not.toContain('undefined')
    expect(Number.isFinite(width) && Number.isFinite(height) && height > 60).toBe(true)
    expect(source).toContain('Build &lt;importer&gt; &amp; wire')
  })

  test('the bar fills in proportion, inside its track, and the text says percent, steps and time', () => {
    const { source } = planSvg(700, view({ pct: 50 }))
    const [track, fill] = rects(source).filter(r => attr(r, 'y') === 45)
    expect(near(attr(fill ?? '', 'width'), attr(track ?? '', 'width') / 2, 0.5)).toBe(true)
    expect(source).toContain('50% · 2/4 steps · 4m12s')
  })

  test('0 percent draws no fill; a task-less goal says so', () => {
    const none = planSvg(700, view({ pct: 0, done: 0, total: 0, shown: [] }))
    expect(rects(none.source).filter(r => attr(r, 'y') === 45).length).toBe(1)
    expect(none.source).toContain('no task list yet')
  })

  test('five chips span the full width, joined by lines; the current one is lit', () => {
    const { source } = planSvg(700, view())
    for (const p of ['researching', 'planning', 'building', 'testing', 'auditing']) expect(source).toContain(`>${p}<`)
    const chips = rects(source).filter(r => attr(r, 'y') === 20)
    expect(chips.length).toBe(5)
    expect(near(attr(chips[0] ?? '', 'x'), 0)).toBe(true)
    const last = chips[4] ?? ''
    expect(near(attr(last, 'x') + attr(last, 'width'), 700, 0.2)).toBe(true) // reaches the right edge
    const links = rects(source).filter(r => attr(r, 'height') === 1.5)
    expect(links.length).toBe(4) // connectors between the five chips
    expect(chips.filter(c => c.includes('fill="#0A84FF"') && c.includes('fill-opacity="1"')).length).toBe(1) // one lit chip
  })

  test('phases you have been in and left are green; ahead of you grey; idle dims the current one', () => {
    const running = planSvg(700, view({ phase: 'building', visited: ['researching', 'planning', 'building'] })).source
    // researching + planning done: green chips; their connectors green too
    expect(running.match(/fill="#30D158" fill-opacity="0.25"/g)?.length).toBe(2)
    expect(running.match(/fill="#30D158" fill-opacity="0.7"/g)?.length).toBe(3) // links from researching, planning, building
    const idle = planSvg(700, view({ isRunning: false })).source
    expect(idle).toContain('fill-opacity="0.55"')
    expect(idle).toContain('· idle')
  })

  test('done: every chip green, no lit blue chip, says complete', () => {
    const done = planSvg(700, view({ isDone: true, pct: 100, done: 4 })).source
    expect(done.match(/fill="#30D158" fill-opacity="0.25"/g)?.length).toBe(5)
    expect(done).toContain('✔ complete')
    expect(done).not.toContain('fill="#0A84FF" fill-opacity="1"')
  })

  test('a narrow panel shows only the current phase', () => {
    const { source } = planSvg(260, view())
    expect(source).toContain('>building<')
    expect(source).not.toContain('>researching<')
  })

  test('checklist rows: done struck through, in-progress bold, +N more', () => {
    const { source } = planSvg(700, view({ hidden: 3 }))
    expect(source).toContain('text-decoration="line-through"')
    expect(source.match(/font-weight="600"/g)?.length).toBeGreaterThanOrEqual(2) // goal + the active step
    expect(source).toContain('+3 more')
    expect(source).toContain('✔')
    expect(source).toContain('◐')
    expect(source).toContain('○')
  })

  test('long goals and steps are clipped to the width', () => {
    const long = 'x'.repeat(400)
    const { source } = planSvg(400, view({ goal: long }))
    expect(source).not.toContain(long)
    expect(source).toContain('…')
  })
})
