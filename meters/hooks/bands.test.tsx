import { describe, expect, test } from 'claude-code/testing'

import { RANK, bandKey, bandsOf, stack } from './bands'
import type { Tree } from './bands'

// A stand-in for the surface's Box: stack() builds the wrapper with h(Box, props, ...children).
const Box = 'Box' as never
const band = (name: keyof typeof RANK): Tree => ({ type: 'Box', props: { key: bandKey(name) }, children: [name] })
const keys = (t: unknown) => bandsOf(t as Tree).map(b => String(b.props?.key))
const engine: Tree = { type: 'engine' }

describe('stack', () => {
  test('ranks fix the order, whichever mod is called first', () => {
    const orders = [
      ['plan-progress', 'meters', 'saver', 'prompt-enhancer'],
      ['prompt-enhancer', 'saver', 'meters', 'plan-progress'],
      ['saver', 'plan-progress', 'prompt-enhancer', 'meters'],
      ['meters', 'prompt-enhancer', 'plan-progress', 'saver'],
    ] as const
    for (const order of orders) {
      let below: Tree = engine
      for (const name of order) below = stack(below, band(name), Box) as Tree
      expect(keys(below)).toEqual(['band:10:plan-progress', 'band:20:meters', 'band:30:saver', 'band:40:prompt-enhancer'])
    }
  })

  test('meters is above saver, so the bars show up first', () => {
    for (const [first, second] of [['saver', 'meters'], ['meters', 'saver']] as const) {
      const t = stack(stack(engine, band(first), Box) as Tree, band(second), Box) as Tree
      expect(keys(t).indexOf(bandKey('meters'))).toBeLessThan(keys(t).indexOf(bandKey('saver')))
    }
  })

  test('a lone band is returned as it is, with no wrapper', () => {
    const only = band('meters')
    expect(stack(engine, only, Box)).toBe(only as never)
  })

  test('a tree from a mod outside the contract stays on top, in the order it came', () => {
    const foreignA: Tree = { type: 'Text', children: ['A'] }
    const foreignB: Tree = { type: 'Text', children: ['B'] }
    let t: Tree = stack(engine, band('saver'), Box) as Tree
    t = stack(t, foreignA, Box) as Tree
    t = stack(t, band('plan-progress'), Box) as Tree
    t = stack(t, foreignB, Box) as Tree
    expect(bandsOf(t).map(b => (b.type === 'Text' ? String(b.children?.[0]) : String(b.props?.key)))).toEqual(['A', 'B', 'band:10:plan-progress', 'band:30:saver'])
  })

  test("saver's rule lands between meters and saver, whichever of them is called first", () => {
    const rule: Tree = { type: 'Box', props: { key: bandKey('saver-rule') }, children: ['rule'] }
    // saver innermost (it cannot see meters), then meters; and the other way round
    const a = stack(stack(engine, [rule, band('saver')], Box) as Tree, band('meters'), Box) as Tree
    const b = stack(stack(engine, band('meters'), Box) as Tree, [rule, band('saver')], Box) as Tree
    for (const t of [a, b]) expect(keys(t)).toEqual(['band:20:meters', 'band:25:saver-rule', 'band:30:saver'])
  })
})
