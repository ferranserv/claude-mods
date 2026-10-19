import { expect, mock, test } from 'claude-code/testing'

import { world as worldAt } from './world'

const WED = new Date(2026, 9, 21, 12).getTime()
const world = (on: Parameters<typeof worldAt>[0], o: Parameters<typeof worldAt>[1] = {}) => worldAt(on, o)

const props = (extra: Record<string, unknown> = {}) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { bodyRows: 10 },
  view: {},
  ...extra,
})

const band = (surface: 'desktop' | 'terminal', extra: Record<string, unknown> = {}) =>
  ({ plugin: 'meters', surface, component: 'AbovePrompt', props: props(extra) }) as never

const PANE_PROPS = {
  title: 'Usage',
  isFocused: false,
  bodyColumns: 24,
  placement: 'dock',
  scroll: { bodyRows: 12 },
  view: {},
}

const measure = (tokens: number, five: number, week: number, window = 1_000_000) => ({
  context: { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: new Date(WED + 134 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: week },
  ],
  changed: ['context', 'rateLimits'] as never,
})

test('desktop band: SVG with the three meters, filled from measurements', async ($, on) => {
  mock.clock(on, { now: WED })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)

  const empty = await $.ui.mount(band('desktop'))
  const svg0 = await empty.find({ type: 'Svg' })
  expect(svg0).toBeDefined()
  await empty.unmount()

  await $.session.measure(measure(200_000, 40, 35) as never)
  const ui = await $.ui.mount(band('desktop'))
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  const source = String((svg as { props?: { source?: string } } | undefined)?.props?.source ?? '')
  expect(source).toContain('20%')
  expect(source).toContain('40%')
  expect(source).toContain('Wed 25% under')
  expect(source).not.toContain('NaN')
  await ui.unmount()
})

test('terminal band: one text line, no Svg', async ($, on) => {
  mock.clock(on, { now: WED })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)

  await $.session.measure(measure(100_000, 10, 20) as never)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Week/ })).toBeDefined()
  await ui.unmount()
})

test('a survey takes the band: meters draws nothing of its own', async ($, on) => {
  mock.clock(on, { now: WED })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(band(surface, { hasSurvey: true }))
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    await ui.unmount()
  }
})

// The side panel: the app, not the mod, decides whether (and where) a docked pane is drawn.
test('/meters side opens the pane and the band steps aside; /meters top brings it back', async ($, on) => {
  const w = world(on, { isPlaced: true })
  await $.session.measure(measure(200_000, 40, 35) as never)

  const side = await $.command.run({ command: 'meters', args: 'side' } as never)
  expect(String((side as { text: string }).text)).toContain('side panel')
  expect(w.open).toEqual(['meters'])
  expect(w.writes.isSide).toBe(true)

  const hidden = await $.ui.mount(band('desktop'))
  expect(await hidden.find({ type: 'Svg' })).toBeUndefined()
  await hidden.unmount()

  const drawn = await $.ui.mount({ plugin: 'meters', surface: 'desktop', component: 'Pane', requestId: 'meters', props: PANE_PROPS } as never)
  const svg = await drawn.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(String((svg as { props?: { source?: string } }).props?.source)).toContain('Context')
  await drawn.unmount()

  const top = await $.command.run({ command: 'meters', args: 'top' } as never)
  expect(String((top as { text: string }).text)).toContain('band')
  expect(w.closed).toEqual(['meters'])
  expect(w.writes.isSide).toBe(false)

  const back = await $.ui.mount(band('desktop'))
  expect(await back.find({ type: 'Svg' })).toBeDefined()
  await back.unmount()
})

test('/meters side where no pane can be drawn: says so and keeps the band', async ($, on) => {
  world(on, { isPlaced: false })
  const r = await $.command.run({ command: 'meters', args: 'side' } as never)
  const text = String((r as { text: string }).text)
  expect(text).toContain('not drawn here')
  expect(text).toContain('too narrow')
  expect(text).not.toContain('Meters moved')

  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('/meters with a bad argument explains itself', async ($, on) => {
  world(on, { isPlaced: true })
  const r = await $.command.run({ command: 'meters', args: 'left' } as never)
  expect(String((r as { text: string }).text)).toContain('Use /meters side, top, cache, handoff, fresh, limits or status')
})

test('terminal side pane is text, not SVG', async ($, on) => {
  world(on, { isPlaced: true })
  await $.session.measure(measure(100_000, 10, 20) as never)
  const ui = await $.ui.mount({ plugin: 'meters', surface: 'terminal', component: 'Pane', requestId: 'meters', props: PANE_PROPS } as never)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeDefined()
  await ui.unmount()
})

test('a stored side preference reopens the pane at session start', async ($, on) => {
  const w = world(on, { isPlaced: true, stored: { isSide: true } })
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  expect(w.open).toEqual(['meters'])
})

// Four mods draw in the band above the prompt. Whatever sits beneath a mod in the chain must
// still show, so every band mod calls next first and stacks its own tree under what came back.
test('stacks under another mod\'s band instead of replacing it', async ($, on) => {
  mock.clock(on, { now: WED })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($2, e) => {
    const { Text } = $2.ui.resolve(e)
    return <Text>OTHER-MOD-BAND</Text>
  })
  await $.session.measure(measure(200_000, 40, 35) as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /OTHER-MOD-BAND/ })).toBeDefined()
    const mine = surface === 'desktop' ? { type: 'Svg' } : { type: 'Text', text: /Context/ }
    expect(await ui.find(mine as never)).toBeDefined()
    await ui.unmount()
  }
})
