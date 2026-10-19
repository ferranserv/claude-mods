import { expect, test } from 'claude-code/testing'

import { MIN, WED, world } from './world'

const text = (r: unknown) => String((r as { text: string }).text)

type W = ReturnType<typeof world>
const usage = (input: number, read: number, create: number) => ({ input_tokens: input, output_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: create, model: 'claude-sonnet-5-5' })

// One main-loop request, as the engine raises it, answered with the usage `u`.
async function step($: unknown, w: W, u: ReturnType<typeof usage>) {
  w.usage = u
  const s = $ as { turn: { step: (i: unknown) => AsyncIterable<unknown> } }
  for await (const chunk of s.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 })) void chunk
}

const started = async ($: unknown) => (await ($ as { session: { start: (i: unknown) => Promise<unknown> } }).session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true }))

test('/cache: default 60 minutes, set by you, back to auto', async ($, on) => {
  const w = world(on)
  await started($)
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('60 min (default')
  expect(text(await $.command.run({ command: 'cache', args: '30' } as never))).toContain('30 min (set by you)')
  expect(w.writes.cacheOverride).toBe(30)
  expect(text(await $.command.run({ command: 'cache', args: 'auto' } as never))).toContain('60 min (default')
  expect(text(await $.command.run({ command: 'cache', args: 'soon' } as never))).toContain('Use /cache <minutes>')
  expect(text(await $.command.run({ command: 'cache', args: '0' } as never))).toContain('Use /cache <minutes>')
})

test('the window is learned: a cache hit after twenty idle minutes means one hour', async ($, on) => {
  const w = world(on)
  await started($)
  await step($, w, usage(100, 0, 90_000))
  await w.clock.advance(20 * MIN)
  await step($, w, usage(100, 90_000, 0))
  expect(w.writes.cacheDetected).toBe(60)
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('learned from the API')
})

test('the window is learned: two cold misses after idle gaps mean five minutes', async ($, on) => {
  const w = world(on)
  await started($)
  await step($, w, usage(100, 0, 90_000))
  await w.clock.advance(20 * MIN)
  await step($, w, usage(100, 0, 90_000))
  expect(w.writes.cacheDetected).toBeUndefined()
  await w.clock.advance(20 * MIN)
  await step($, w, usage(100, 0, 90_000))
  expect(w.writes.cacheDetected).toBe(5)
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('5 min (learned')
})

test('a notice goes out five minutes before the cache goes cold, once', async ($, on) => {
  const w = world(on)
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(54 * MIN)
  expect(w.notices.length).toBe(0)
  await w.clock.advance(2 * MIN)
  expect(w.notices.length).toBe(1)
  expect(w.notices[0]).toContain('goes cold')
  expect(w.toasts.some(t => t.includes('goes cold'))).toBe(true)
  await w.clock.advance(2 * MIN)
  expect(w.notices.length).toBe(1)

  // A new reply starts a new countdown, and a new notice.
  await step($, w, usage(100, 190_000, 0))
  await w.clock.advance(57 * MIN)
  expect(w.notices.length).toBe(2)
})

const send = ($: unknown, text: string, command?: { name: string; args: string }) =>
  ($ as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text, command, origin: { kind: 'composer' } })

test('sending a message restarts the countdown at the full window; commands do not', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(40 * MIN)
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('20:00 left')

  await send($, '/cache', { name: 'cache', args: '' })
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('20:00 left')

  await send($, 'next question')
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('1:00:00 left')
  await w.clock.advance(10 * MIN)
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('50:00 left')
})

test('learning still works when a message was sent in between (the gap runs from the last reply)', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(20 * MIN)
  await send($, 'back after a while')
  await step($, w, usage(100, 190_000, 0))
  expect(w.writes.cacheDetected).toBe(60)
})

test('the countdown restarts when each request goes out, not when it ends', async ($, on) => {
  const w = world(on)
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(30 * MIN)
  await step($, w, usage(100, 190_000, 0))
  // the stub answers instantly, so the request started now: a full window again
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('1:00:00 left')
})

test('the notice shows what the next message costs warm and cold', async ($, on) => {
  const w = world(on)
  await started($)
  await $.session.measure({ context: { tokens: 200_000, window: 1_000_000, percent: 20 }, rateLimits: [], changed: ['context'] } as never)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(56 * MIN)
  expect(w.notices[0]).toContain('$0.04')
  expect(w.notices[0]).toContain('$0.80')
})

test('Handoff & Clear with a warm cache: fork writes the brief, session clears, brief lands in the box', async ($, on) => {
  const w = world(on, { brief: 'Continuing from a previous session. Goal: x' })
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(5 * MIN)

  const r = await $.command.run({ command: 'handoff', args: '' } as never)
  expect(text(r)).toContain('Writing a handoff brief')
  await w.clock.advance(5000)

  expect(w.asked.map(a => a.kind)).toEqual(['fork'])
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBe('Continuing from a previous session. Goal: x')
  expect(w.writes.lastBrief).toBe('Continuing from a previous session. Goal: x')
  expect(w.files.length).toBe(1)
  expect(w.files[0]?.path).toMatch(/^\/home\/test\/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md$/)
  expect(w.toasts.at(-1)).toContain('brief is in the prompt box')
})

test('Handoff & Clear with a cold cache: a small model reads the transcript tail instead of re-caching it', async ($, on) => {
  const w = world(on, { messages: [{ role: 'user', text: 'plan the importer' }, { role: 'assistant', text: 'schema written' }] })
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(90 * MIN)

  await $.command.run({ command: 'handoff', args: '' } as never)
  await w.clock.advance(5000)

  expect(w.asked.map(a => a.kind)).toEqual(['complete'])
  expect(w.asked[0]?.model).toBe('haiku')
  expect(w.asked[0]?.prompt).toContain('User: plan the importer')
  expect(w.asked[0]?.prompt).toContain('Claude: schema written')
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBe('COMPLETE BRIEF')
})

test('nothing is cleared when there is nothing to hand off', async ($, on) => {
  const w = world(on, { messages: [] })
  await started($)
  await $.command.run({ command: 'handoff', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(w.toasts.at(-1)).toContain('Nothing to hand off')
})

test('handoff waits while Claude is working', async ($, on) => {
  const w = world(on)
  await started($)
  await ($ as unknown as { turn: { start: (i: unknown) => Promise<unknown> } }).turn.start({ text: 'go', turnId: 't1' })
  await $.command.run({ command: 'handoff', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(w.toasts.at(-1)).toContain('working')
})

test('/handoff paste puts the last brief in the box without writing a new one or clearing again', async ($, on) => {
  const w = world(on, { stored: { lastBrief: 'OLD BRIEF' } })
  await started($)
  await $.command.run({ command: 'handoff', args: 'paste' } as never)
  await w.clock.advance(5000)
  expect(w.asked).toEqual([])
  expect(w.commands).toEqual([])
  expect(w.fills.at(-1)).toBe('OLD BRIEF')
})

test('/fresh clears with no handoff', async ($, on) => {
  const w = world(on)
  await started($)
  await $.command.run({ command: 'fresh', args: '' } as never)
  await w.clock.advance(100)
  expect(w.commands).toEqual(['clear'])
  expect(w.asked).toEqual([])
  expect(w.fills).toEqual([])
})

const edit = ($: unknown, key: object) =>
  ($ as { prompt: { edit: (i: unknown) => Promise<{ text: string }> } }).prompt.edit({ origin: { kind: 'composer' }, key, text: 'half-typed', cursor: 10, start: 10, end: 10, inputText: '' })

test('hotkeys: meta+h hands off, meta+n starts fresh, both leave the draft alone; other keys pass through', async ($, on) => {
  const w = world(on)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  await started($)

  expect((await edit($, { key: 'h', meta: true })).text).toBe('half-typed')
  await w.clock.advance(5000)
  expect(w.asked.length).toBe(1)
  expect(w.commands).toEqual(['clear'])

  w.commands.length = 0
  w.asked.length = 0
  expect((await edit($, { key: 'n', meta: true })).text).toBe('half-typed')
  await w.clock.advance(100)
  expect(w.commands).toEqual(['clear'])
  expect(w.asked).toEqual([])

  w.commands.length = 0
  await edit($, { key: 'h' })
  await edit($, { key: 'h', ctrl: true })
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
})

const band = (surface: 'desktop' | 'terminal', isWorking = false) =>
  ({ plugin: 'meters', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} } }) as never

test('buttons: shown from the first warning, hidden when calm or while working; pressing one runs it', async ($, on) => {
  const w = world(on)
  await started($)
  const at = (percent: number) => $.session.measure({ context: { tokens: percent * 1000, window: 100_000, percent }, rateLimits: [], changed: ['context'] } as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    await at(20)
    let ui = await $.ui.mount(band(surface))
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()

    await at(55)
    ui = await $.ui.mount(band(surface))
    expect(await ui.find({ key: 'handoff' })).toBeDefined()
    expect(await ui.find({ key: 'fresh' })).toBeDefined()
    await ui.unmount()

    ui = await $.ui.mount(band(surface, true))
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    await ui.unmount()
  }

  await at(55)
  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'fresh' })
  await w.clock.advance(100)
  expect(w.commands).toEqual(['clear'])
  await ui.unmount()
})

test('the cache meter counts down in the band, and shows cold after the window', async ($, on) => {
  const w = world(on)
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(18 * MIN)
  let ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /45m/ })).toBeDefined()
  await ui.unmount()
  await w.clock.advance(50 * MIN)
  ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  await ui.unmount()
  expect(WED).toBeGreaterThan(0)
})

test('every command registers; /meters status says so', async ($, on) => {
  const w = world(on)
  await started($)
  expect(w.registered).toEqual(['meters', 'cache', 'fresh', 'handoff', 'newsession'])
  expect(text(await $.command.run({ command: 'meters', args: 'status' } as never))).toBe('Commands registered: /meters /cache /fresh /handoff /newsession.')
})

test('a refused name does not stop the other commands or the rest of session start', async ($, on) => {
  const w = world(on, { refuse: ['handoff', 'fresh'], stored: { isSide: true } })
  await started($)
  // /cache still registers after the refusals before it, and the side panel is still restored
  expect(w.registered).toEqual(['meters', 'cache', 'newsession'])
  expect(w.open).toEqual(['meters'])
  const status = text(await $.command.run({ command: 'meters', args: 'status' } as never))
  expect(status).toContain('Commands registered: /meters /cache /newsession')
  expect(status).toContain('Refused by the app: /fresh /handoff')
  expect(status).toContain('/meters')
})

test('/meters cache, /meters fresh and /meters handoff work when their own names are taken', async ($, on) => {
  const w = world(on, { refuse: ['cache', 'fresh', 'handoff'] })
  await started($)
  expect(text(await $.command.run({ command: 'meters', args: 'cache' } as never))).toContain('Prompt cache window 60 min')
  expect(text(await $.command.run({ command: 'meters', args: 'cache 30' } as never))).toContain('30 min (set by you)')
  await $.command.run({ command: 'meters', args: 'fresh' } as never)
  await w.clock.advance(100)
  expect(w.commands).toEqual(['clear'])
  w.commands.length = 0
  await $.command.run({ command: 'meters', args: 'handoff' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBeDefined()
})

test('/newsession does the same as /handoff', async ($, on) => {
  const w = world(on, { brief: 'B' })
  await started($)
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBe('B')
})

test('/meters warn, red, tokens: change the context warning levels without the options screen', async ($, on) => {
  const w = world(on)
  await started($)
  const at = (percent: number) => $.session.measure({ context: { tokens: percent * 100, window: 10_000, percent }, rateLimits: [], changed: ['context'] } as never)

  await at(10)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'handoff' })).toBeUndefined() // 10% is calm at the default 50
  await ui.unmount()

  expect(text(await $.command.run({ command: 'meters', args: 'warn 5' } as never))).toContain('orange from 5%')
  expect(w.writes.limitOverrides).toEqual({ warnPercent: 5 })
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'handoff' })).toBeDefined() // now it warns
  await ui.unmount()

  expect(text(await $.command.run({ command: 'meters', args: 'red 8' } as never))).toContain('red past 8%')
  expect(text(await $.command.run({ command: 'meters', args: 'tokens 50k' } as never))).toContain('50k tokens')
  expect(w.writes.limitOverrides).toEqual({ warnPercent: 5, redPercent: 8, warnTokens: 50_000 })

  expect(text(await $.command.run({ command: 'meters', args: 'warn 0' } as never))).toContain('Use /meters warn')
  expect(text(await $.command.run({ command: 'meters', args: 'warn lots' } as never))).toContain('Use /meters warn')
  expect(text(await $.command.run({ command: 'meters', args: 'tokens 10' } as never))).toContain('at least 1000')

  expect(text(await $.command.run({ command: 'meters', args: 'limits reset' } as never))).toContain('from the options')
  expect(text(await $.command.run({ command: 'meters', args: 'limits' } as never))).toContain('orange from 50%')
})

test('saved warning levels come back at session start; red never sits below orange', async ($, on) => {
  world(on, { stored: { limitOverrides: { warnPercent: 30, redPercent: 10 } } })
  await started($)
  expect(text(await $.command.run({ command: 'meters', args: 'limits' } as never))).toContain('orange from 30%')
  expect(text(await $.command.run({ command: 'meters', args: 'limits' } as never))).toContain('red past 30%')
})

test('meters draws no rule of its own: it belongs to the saver strip, which is hidden unless active', async ($, on) => {
  world(on)
  await started($)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
  await ui.unmount()
  const d = await $.ui.mount(band('desktop'))
  expect(await d.find({ type: 'Svg' })).toBeDefined()
  await d.unmount()
})
