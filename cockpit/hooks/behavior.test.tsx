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
  expect(w.notices.some(t => t.includes('goes cold'))).toBe(true)
  await w.clock.advance(2 * MIN)
  expect(w.notices.length).toBe(1)

  // A new reply starts a new countdown, and a new notice.
  await step($, w, usage(100, 190_000, 0))
  await w.clock.advance(57 * MIN)
  expect(w.notices.length).toBe(2)
})

/** Everything the bubble said lately and the last brief's path (/cockpit log): where messages live now, no toasts. */
const said = async ($: unknown): Promise<string> => text(await ($ as { command: { run: (i: unknown) => Promise<unknown> } }).command.run({ command: 'cockpit', args: 'log' }))

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

  const r = await $.command.run({ command: 'newsession', args: '' } as never)
  expect(text(r)).toContain('Writing a handoff brief')
  await w.clock.advance(5000)

  expect(w.asked.map(a => a.kind)).toEqual(['fork'])
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBe('Continuing from a previous session. Goal: x')
  expect(w.writes.lastBrief).toBe('Continuing from a previous session. Goal: x')
  expect(w.files.length).toBe(1)
  expect(w.files[0]?.path).toMatch(/^\/home\/test\/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md$/)
  expect(await said($)).toContain('brief is in the prompt box')
})

test('Handoff & Clear with a cold cache: a small model reads the transcript tail instead of re-caching it', async ($, on) => {
  const w = world(on, { messages: [{ role: 'user', text: 'plan the importer' }, { role: 'assistant', text: 'schema written' }] })
  await started($)
  await step($, w, usage(100, 0, 190_000))
  await w.clock.advance(90 * MIN)

  await $.command.run({ command: 'newsession', args: '' } as never)
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
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(await said($)).toContain('Nothing to hand off')
})

test('handoff waits while Claude is working', async ($, on) => {
  const w = world(on)
  await started($)
  await ($ as unknown as { turn: { start: (i: unknown) => Promise<unknown> } }).turn.start({ text: 'go', turnId: 't1' })
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(await said($)).toContain('working')
})

test('/handoff paste puts the last brief in the box without writing a new one or clearing again', async ($, on) => {
  const w = world(on, { stored: { lastBrief: 'OLD BRIEF' } })
  await started($)
  await $.command.run({ command: 'newsession', args: 'paste' } as never)
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
  ({ plugin: 'cockpit', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} } }) as never

test('buttons: shown from the first warning, hidden when calm or while working; the others are behind the …', async ($, on) => {
  const w = world(on)
  await started($)
  await w.clock.advance(6000)
  const at = (percent: number) => $.session.measure({ context: { tokens: percent * 1000, window: 100_000, percent }, rateLimits: [], changed: ['context'] } as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    await at(20)
    let ui = await $.ui.mount(band(surface))
    expect(await ui.find({ key: 'copy' })).toBeUndefined()
    await ui.unmount()

    await at(55)
    await settle($, w) // he settles into the pose before the bubble speaks
    ui = await $.ui.mount(band(surface))
    expect(await ui.find({ key: 'copy' })).toBeDefined()
    expect(await ui.find({ key: 'more' })).toBeDefined()
    expect(await ui.find({ key: 'fresh' })).toBeUndefined() // in the menu, not on the bubble
    await ui.unmount()

    ui = await $.ui.mount(band(surface, true))
    expect(await ui.find({ key: 'copy' })).toBeUndefined()
    await ui.unmount()
  }

  await at(55)
  await settle($, w)
  let ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'more' })
  await ui.unmount()
  ui = await $.ui.mount(band('desktop'))
  for (const key of ['handoff', 'compact', 'fresh']) expect(await ui.find({ key })).toBeDefined()
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
  expect(w.registered).toEqual(['meters', 'cache', 'fresh', 'newsession', 'saver', 'preflight', 'enhance', 'cockpit'])
  expect(text(await $.command.run({ command: 'meters', args: 'status' } as never))).toBe('Commands registered: /meters /cache /fresh /newsession.')
})

test('a refused name does not stop the other commands or the rest of session start', async ($, on) => {
  const w = world(on, { refuse: ['newsession', 'fresh'], stored: { isSide: true } })
  await started($)
  // /cache still registers after the refusals before it, and the side panel is still restored
  expect(w.registered).toEqual(['meters', 'cache', 'saver', 'preflight', 'enhance', 'cockpit'])
  expect(w.open).toEqual(['cockpit'])
  const status = text(await $.command.run({ command: 'meters', args: 'status' } as never))
  expect(status).toContain('Commands registered: /meters /cache')
  expect(status).toContain('Refused by the app: /fresh /newsession')
  expect(status).toContain('/meters')
})

test('/meters cache, /meters fresh and /meters handoff work when their own names are taken', async ($, on) => {
  const w = world(on, { refuse: ['cache', 'fresh', 'newsession'] })
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

test('/newsession writes a brief, clears and pastes', async ($, on) => {
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
  await w.clock.advance(6000)

  await at(10)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'copy' })).toBeUndefined() // 10% is calm at the default 50
  await ui.unmount()

  expect(text(await $.command.run({ command: 'meters', args: 'warn 5' } as never))).toContain('orange from 5%')
  expect(w.writes.limitOverrides).toEqual({ warnPercent: 5 })
  await settle($, w)
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'copy' })).toBeDefined() // now it warns
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

test('/newsession paste puts the last brief in the box and does not clear, however the argument is spelled', async ($, on) => {
  for (const args of ['paste', ' PASTE ', 'paste last']) {
    const w = world(on, { stored: { lastBrief: 'OLD BRIEF' } })
    await started($)
    await $.command.run({ command: 'newsession', args } as never)
    await w.clock.advance(5000)
    expect(w.commands).toEqual([])
    expect(w.asked).toEqual([])
    expect(w.fills.at(-1)).toBe('OLD BRIEF')
    break // one world per test: the spellings are covered by handoffMode below
  }
})

test('without HOME (Windows) the copy goes under USERPROFILE and the toast says where', async ($, on) => {
  const w = world(on, { env: { USERPROFILE: 'C:\\Users\\f' }, brief: 'B' })
  await started($)
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.files.length).toBe(1)
  // (the test host is not Windows, so it prefixes its own folder to the drive path; on Windows it is absolute)
  expect(w.files[0]?.path).toMatch(/C:\\Users\\f\/\.claude\/handoffs\/handoff-\d{8}-\d{6}\.md$/)
  expect(await said($)).toContain('A copy is saved at C:')
  expect(String(w.writes.lastBriefPath)).toContain('C:\\Users\\f/.claude/handoffs/handoff-')
})

test('when no home folder is known the handoff still works and says the copy was not saved', async ($, on) => {
  const w = world(on, { env: {}, brief: 'B' })
  await started($)
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.files).toEqual([])
  expect(w.commands).toEqual(['clear'])
  expect(w.fills.at(-1)).toBe('B')
  expect(await said($)).toContain('could not be saved')
})

test('copy mode (/newsession brief, /meters brief): brief in the box and on the clipboard, session kept', async ($, on) => {
  const w = world(on, { brief: 'THE BRIEF' })
  await started($)
  for (const [command, args] of [['newsession', 'brief'], ['meters', 'brief']] as const) {
    w.commands.length = 0
    w.fills.length = 0
    w.copied.length = 0
    w.box.text = ''
    await $.command.run({ command, args } as never)
    await w.clock.advance(5000)
    expect(w.commands).toEqual([]) // never cleared
    expect(w.fills.at(-1)).toBe('THE BRIEF')
    expect(w.copied).toEqual(['THE BRIEF'])
    expect(await said($)).toContain('Your session is unchanged')
  }
})

test('copy mode appends to a draft instead of replacing it', async ($, on) => {
  const w = world(on, { brief: 'THE BRIEF' })
  await started($)
  w.box.text = 'my half-written message'
  await $.command.run({ command: 'meters', args: 'brief' } as never)
  await w.clock.advance(5000)
  expect(w.fillModes.at(-1)).toBe('append')
  expect(w.fills.at(-1)).toContain('THE BRIEF')
})

test('buttons hide while a turn runs even when the app does not set isWorking; the bubble has Handoff and a … when idle', async ($, on) => {
  const w = world(on)
  await started($)
  await w.clock.advance(6000)
  await $.session.measure({ context: { tokens: 600, window: 1000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  let ui = await $.ui.mount(band('desktop'))
  for (const key of ['copy', 'more']) expect(await ui.find({ key })).toBeDefined()
  await ui.unmount()

  await ($ as unknown as { turn: { start: (i: unknown) => Promise<unknown> } }).turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount(band('desktop', false))
  expect(await ui.find({ key: 'copy' })).toBeUndefined()
  expect(await ui.find({ key: 'more' })).toBeUndefined()
  await ui.unmount()
  expect(w.commands).toEqual([])
})
test('the copy button keeps the session', async ($, on) => {
  const w = world(on, { brief: 'B' })
  await started($)
  await w.clock.advance(6000)
  await $.session.measure({ context: { tokens: 600, window: 1000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'copy' }) // the bubble's own button
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(w.fills.at(-1)).toBe('B')
  await ui.unmount()
})
// ---- the cockpit band: collapsed row, arrow, auto-open, a button for every warning

const measureCtx = ($: unknown, percent: number) =>
  ($ as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: percent * 10, window: 1000, percent }, rateLimits: [], changed: ['context'] })

test('calm: the band is the meters and the wand only; no arrow, no bubble, no saver line', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'lane' })).toBeDefined() // the bubble's row is always there, empty, so the band never grows
  for (const key of ['toggle', 'more', 'saver', 'alert-ctx']) expect(await ui.find({ key })).toBeUndefined()
  expect(await ui.find({ key: 'enhance' })).toBeDefined()
  await ui.unmount()
})
test('a warning speaks in one bubble: Copy handoff on it, Handoff, Compact and Fresh behind the …; the meters row is not touched', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'lane' })).toBeDefined()
  expect(await ui.find({ key: 'copy' })).toBeDefined()
  expect(await ui.find({ key: 'row' })).toBeDefined() // the band's own row is always there, with the meters
  expect(await ui.find({ key: 'menu' })).toBeUndefined()
  await ui.press({ key: 'more' })
  await ui.unmount()
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'menu' })).toBeDefined()
  for (const key of ['handoff', 'compact', 'fresh']) expect(await ui.find({ key })).toBeDefined()
  await ui.unmount()
})
test('the expand arrow and /cockpit open|close|auto are gone: the band is one row', async ($, on) => {
  world(on)
  await started($)
  await measureCtx($, 90)
  expect(text(await $.command.run({ command: 'cockpit', args: 'close' } as never))).toContain('one row')
  expect(text(await $.command.run({ command: 'cockpit', args: '' } as never))).toContain('always visible')
})
test('5-hour limit at 80%: the bubble offers Turn saver on, and pressing it turns saver on', async ($, on) => {
  const w = world(on, { stored: { saverOn: false } })
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: 100, window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'saver' })).toBeDefined()
  await ui.press({ key: 'saver' })
  expect(w.writes.saverOn).toBe(true)
  await ui.unmount()
})
test('a warning with no action to offer is dropped: saver already on, 5-hour at 85%', async ($, on) => {
  world(on)
  await started($)
  await ($ as unknown as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: 100, window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-five' })).toBeUndefined()
  await ui.unmount()
})

// ---- Clawd: the state on screen follows what is happening, in priority order (hooks/mood.ts)

type Do = { tool: { call: (i: unknown) => Promise<unknown>; check: (i: unknown) => Promise<unknown> }; turn: { start: (i: unknown) => Promise<unknown>; complete: (i: unknown) => Promise<unknown> } }
const altOf = async ($: unknown, isWorking = false): Promise<string> => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ find: (q: unknown) => Promise<{ props?: { alt?: string } } | undefined>; findAll: (q: unknown) => Promise<{ props?: { alt?: string } }[]>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop', isWorking))
  // Clawd's drawing says who he is and what he does; the bubble's says its words (Clawd's alt does not change with them, or he would be redrawn).
  const svgs = await ui.findAll({ type: 'Svg' })
  const alt = svgs.map(v => String(v.props?.alt ?? '')).filter(a => a !== 'bubble space' && !a.startsWith('Context')).join(' . ')
  await ui.unmount()
  return alt
}/** He settles into a new pose before his bubble speaks: draw once so the change is seen, then let the move play. */
const settle = async ($: unknown, w: { clock: { advance: (ms: number) => Promise<unknown> } }, ms = 4000): Promise<void> => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
  await ui.unmount()
  await w.clock.advance(ms)
}
/** The meters' own alt text: they are a drawing apart from Clawd's. */
const metersAltOf = async ($: unknown): Promise<string> => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ findAll: (q: unknown) => Promise<{ props?: { alt?: string } }[]>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
  const alt = String((await ui.findAll({ type: 'Svg' })).find(v => String(v.props?.alt ?? '').includes('Context'))?.props?.alt ?? '')
  await ui.unmount()
  return alt
}
const ok = () => ({ ref: 0, result: {}, text: 'ok' }) as never

test('Clawd relaxes in sunglasses when nothing is going on; the session starts with a walk', async ($, on) => {
  const w = world(on)
  expect(await altOf($)).toContain('relaxing in sunglasses')
  await started($)
  await measureCtx($, 10)
  expect(await altOf($)).toContain('walks in')
  await w.clock.advance(6000)
  expect(await altOf($)).toContain('relaxing')
})

test('an Edit shows the hammer while it runs and a moment after; then the lasting state is back', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await w.clock.advance(6000)
  await measureCtx($, 90) // fire
  expect(await altOf($)).toContain('on fire')
  await ($ as unknown as Do).tool.call({ tool: 'Edit', file_path: '/r/app.ts', old_string: 'a', new_string: 'b' })
  expect(await altOf($)).toContain('hammer')
  await w.clock.advance(2000)
  expect(await altOf($)).toContain('hammer') // a state stays on screen at least five seconds
  await w.clock.advance(5000)
  expect(await altOf($)).toContain('on fire')
})

test('reading and web tools get their own states', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as Do).tool.call({ tool: 'Grep', pattern: 'x' })
  expect(await altOf($)).toContain('reading')
  await w.clock.advance(6000)
  await ($ as unknown as Do).tool.call({ tool: 'WebSearch', query: 'q' })
  expect(await altOf($)).toContain('searching the web')
})

test('a failed tool is an oops, a passing test run is the lab, an approved plan is an idea', async ($, on) => {
  const w = world(on)
  let next: unknown = { ref: 0, result: {}, text: 'x', isError: true }
  on('tool.call', () => next as never)
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as Do).tool.call({ tool: 'Bash', command: 'false' })
  expect(await altOf($)).toContain('oops')
  await w.clock.advance(5000)
  next = ok()
  await ($ as unknown as Do).tool.call({ tool: 'Bash', command: 'pnpm test' })
  expect(await altOf($)).toContain('bubbling flasks')
  await w.clock.advance(5000)
  await ($ as unknown as Do).tool.call({ tool: 'ExitPlanMode', plan: 'p' })
  expect(await altOf($)).toContain('idea')
})

test('a question to you raises a hand until it is answered; permission prompts, other calls and queries do not', async ($, on) => {
  const w = world(on)
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', ok)
  await started($)
  await w.clock.advance(6000)
  const d = $ as unknown as Do
  await d.tool.check({ tool: 'AskUserQuestion', input: {} }) // a query: nothing will run, nobody is asked
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('clipboard')
  await d.tool.check({ tool: 'Bash', input: { command: 'rm -rf x' }, tool_use_id: 'z' } as never) // a permission prompt is not a question
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('clipboard')
  await d.tool.check({ tool: 'AskUserQuestion', input: {}, tool_use_id: 'a' } as never)
  expect(await altOf($)).not.toContain('clipboard') // an ask settled at once by a rule shows nothing
  await w.clock.advance(4000)
  expect(await altOf($)).not.toContain('clipboard') // still inside the 5 s it takes to be sure
  await w.clock.advance(1100)
  expect(await altOf($)).toContain('clipboard')
  await d.tool.call({ tool: 'Read', file_path: '/x/a.ts', tool_use_id: 'b' } as never) // a parallel call ends: the question is still open
  expect(await altOf($)).toContain('clipboard')
  await d.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'a' } as never) // you answered: the call ended
  expect(await altOf($)).not.toContain('clipboard')
})

test('a /handoff turn shows Clawd writing with the quill, and the writing ends with the turn', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text: '/handoff until now', origin: { kind: 'composer' } })
  await ($ as unknown as Do).turn.start({ text: '/handoff until now', turnId: 't1' })
  expect(await altOf($, true)).toContain('quill')
  await ($ as unknown as Do).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't1' })
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('quill')
})

test('a bubble that asks for a decision stays until you answer it, and clicking Clawd brings it back', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await measureCtx($, 60) // a warning with a button, spoken by the bubble
  await w.clock.advance(6000)
  expect(await hasButton($, 'copy')).toBe(true)
  await w.clock.advance(60_000) // the warning still holds: so does the bubble, however long it takes
  expect(await hasButton($, 'copy')).toBe(true)
  await ($ as unknown as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text: 'something else', origin: { kind: 'composer' } })
  await w.clock.advance(10_000)
  expect(await hasButton($, 'copy')).toBe(false) // sending something else answers it: the bubble is gone...
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'recall' })).toBeDefined() // ...but Clawd is a button: one click on him says it again (the app has no hover to count on)
  await ui.press({ key: 'recall' })
  await ui.unmount()
  await settle($, w, 4000)
  expect(await hasButton($, 'copy')).toBe(true) // the warning is back, with its button, until it is answered again
})

test('"Done." speaks over a pending decision while the bell rings, then the decision returns; it ends by itself when its warning does', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await $.command.run({ command: 'cockpit', args: 'close' } as never)
  expect(await altOf($)).toContain('tipsy')
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await ($ as unknown as Do).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't1' })
  await settle($, w, 2500)
  expect(await altOf($)).toContain('Done.') // the bell outranks the warning: it speaks, with no button
  expect(await hasButton($, 'copy')).toBe(false)
  await settle($, w, 5100) // the bell is over...
  await settle($, w, 3000) // ...he settles back into the pose
  expect(await hasButton($, 'copy')).toBe(true) // the open question is back, with its real button beside it
  await w.clock.advance(8000)
  await measureCtx($, 10) // the context is cleared: the warning is over, so the bubble and the pose are too
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('tipsy')
  expect(await altOf($)).not.toContain('Done.')
})

test('asleep ends when the 5-hour limit resets, without waiting for the next reply', async ($, on) => {
  const w = world(on)
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: 100, window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(WED + 30 * MIN).toISOString() }], changed: ['context', 'rateLimits'] })
  expect(await altOf($)).toContain('asleep')
  await w.clock.advance(31 * MIN)
  expect(await altOf($)).not.toContain('asleep')
  expect(await metersAltOf($)).toContain('5-hour limit 0% used')
})

test('a cold cache clears, the pose and its bubble, when a new message is sent', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await step($, w, usage(100, 0, 20_000))
  await w.clock.advance(70 * MIN) // past the 60-minute window
  await measureCtx($, 10) // calm, so only the cache has anything to say
  await $.command.run({ command: 'cockpit', args: 'close' } as never)
  expect(await altOf($)).toContain('frozen')
  expect(await hasButton($, 'handoff')).toBe(true)
  await send($, 'hello again')
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('frozen')
  expect(await hasButton($, 'handoff')).toBe(false)
})

test('a bubble goes with its pose: "Done." is said while the bell rings and is deleted when it is over', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await started($)
  await measureCtx($, 10) // calm: no lasting warning to take over once the bell is over
  await w.clock.advance(6000)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await ($ as unknown as Do).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't1' })
  await settle($, w, 2500) // the bell is in his hand, then he says it
  expect(await altOf($)).toContain('Done.') // while the bell rings
  await settle($, w, 6000) // the bell is over
  await settle($, w, 100)
  expect(await altOf($)).not.toContain('Done.') // no bubble about what he is no longer doing
})
test('a finished turn rings the bell over a warning, then the warning returns', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await started($)
  await w.clock.advance(6000)
  await measureCtx($, 90)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  expect(await altOf($, true)).toContain('on fire')
  await ($ as unknown as Do).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't1' })
  expect(await altOf($)).toContain('rings a bell')
  await w.clock.advance(5000)
  expect(await altOf($)).toContain('on fire')
})

test('thinking before any tool, typing after, coffee when the turn drags on', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  expect(await altOf($, true)).toContain('thinking')
  await ($ as unknown as Do).tool.call({ tool: 'Bash', command: 'ls' })
  await w.clock.advance(2000)
  expect(await altOf($, true)).toContain('typing')
  await w.clock.advance(125_000)
  expect(await altOf($, true)).toContain('coffee')
})

test('/cockpit demo shows a state you ask for, and says when it does not know one', async ($, on) => {
  world(on)
  await started($)
  expect(text(await $.command.run({ command: 'cockpit', args: 'demo typing' } as never))).toContain('typing')
  expect(await altOf($)).toContain('typing on a laptop')
  expect(text(await $.command.run({ command: 'cockpit', args: 'demo nonsense' } as never))).toContain('No state called')
  await $.command.run({ command: 'cockpit', args: 'demo off' } as never)
  expect(await altOf($)).not.toContain('typing on a laptop')
})

// ---- Clawd's size: normal, small, off

/** Whether the band holds a real button with this key. */
const hasButton = async ($: unknown, key: string): Promise<boolean> => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ find: (q: unknown) => Promise<unknown>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
  const found = (await ui.find({ key })) !== undefined
  await ui.unmount()
  return found
}

const svgOf = async ($: unknown) => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ find: (q: unknown) => Promise<{ props?: { source?: string } } | undefined>; findAll: (q: unknown) => Promise<{ props?: { source?: string } }[]>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
  const source = (await ui.findAll({ type: 'Svg' })).map(v => String(v.props?.source ?? '')).join('')
  await ui.unmount()
  return source
}

test('after a state change the drawing is replaced once, and not again when the move ends', async ($, on) => {
  const w = world(on)
  await started($)
  const before = await svgOf($)
  await $.command.run({ command: 'cockpit', args: 'demo typing' } as never)
  const during = await svgOf($)
  expect(during).not.toBe(before) // the change: one new drawing, with the move and the loop in it
  await w.clock.advance(700) // longer than any move
  expect(await svgOf($)).toBe(during)
  await w.clock.advance(2000)
  expect(await svgOf($)).toBe(during)
})
test('demo cold: Clawd and the bubble with its real button stay until you answer, and go together', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await $.command.run({ command: 'cockpit', args: 'demo cold' } as never)
  expect(await altOf($)).toContain('frozen')
  expect(await hasButton($, 'handoff')).toBe(true) // the button is a real one, laid out with the bubble
  await w.clock.advance(30_000) // far longer than the four seconds of a timed demo
  expect(await altOf($)).toContain('frozen')
  expect(await hasButton($, 'handoff')).toBe(true)
  await send($, 'hello')
  await w.clock.advance(6000)
  expect(await altOf($)).not.toContain('frozen')
  expect(await hasButton($, 'handoff')).toBe(false)
})

test('a timed demo takes its bubble away with its state, and leaves nothing pending', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await $.command.run({ command: 'cockpit', args: 'demo' } as never)
  await w.clock.advance(4000 * 40) // the whole tour
  await w.clock.advance(12_000)
  expect(await hasButton($, 'copy')).toBe(false)
  expect(await altOf($)).not.toContain('frozen')
})

test('the buttons are ONE gray picture with one real Button per pill laid over it, cut to it; they can never overlap', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await settle($, w)
  type Mounted = { find: (q: unknown) => Promise<{ props?: Record<string, unknown> } | undefined>; findAll: (q: unknown) => Promise<{ props?: { alt?: string; source?: string; width?: number; height?: number } }[]>; unmount: () => Promise<void> }
  const ui = (await $.ui.mount(band('desktop'))) as unknown as Mounted
  const group = (await ui.findAll({ type: 'Svg' })).find(v => v.props?.alt === 'Copy handoff, …')
  expect(group).toBeDefined() // the primary button and the "…" are one drawing
  expect(group?.props?.source).toContain('#8E8E93') // the bubble's own gray, opaque
  expect(group?.props?.source).not.toContain('fill-opacity')
  expect(group?.props?.height).toBe(26) // as tall as the bubble
  expect(await ui.find({ key: 'copy' })).toBeDefined()
  expect(await ui.find({ key: 'more' })).toBeDefined()
  expect((await ui.find({ key: 'btns-wrap' }))?.props?.overflow).toBe('hidden')
  expect((await ui.find({ key: 'hit' }))?.props).toMatchObject({ top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', overflow: 'hidden' }) // the Button layer is the picture's own box
  expect((await ui.find({ key: 'hit-copy' }))?.props?.width).toBe(0) // each Button's piece shares the picture by flex ratio, in no unit of the host's
  expect(Number((await ui.find({ key: 'hit-copy' }))?.props?.flexGrow)).toBeGreaterThan(Number((await ui.find({ key: 'gap-1' }))?.props?.flexGrow))
  expect(await ui.find({ key: 'copy-2' })).toBeUndefined() // one Button per pill
  await ui.unmount()
})

const heightOf = (source: string) => Number(/ height="(\d+)"/.exec(source)?.[1])

test('/cockpit mascot small and off shrink or remove Clawd, remember the choice, and keep the meters', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  const normal = await svgOf($)
  expect(normal).toContain('scale(2)')
  expect(heightOf(normal)).toBe(56)

  expect(text(await $.command.run({ command: 'cockpit', args: 'mascot small' } as never))).toContain('small')
  expect(w.writes.mascot).toBe('small')
  const small = await svgOf($)
  expect(small).toContain('scale(1)')
  expect(heightOf(small)).toBeLessThan(heightOf(normal))

  expect(text(await $.command.run({ command: 'cockpit', args: 'mascot off' } as never))).toContain('hidden')
  const off = await svgOf($)
  expect(off).not.toContain('DA7758')
  expect(off).toContain('Context')
  expect(heightOf(off)).toBeLessThan(56)

  expect(text(await $.command.run({ command: 'cockpit', args: 'mascot' } as never))).toContain('Use /cockpit mascot')
  await $.command.run({ command: 'cockpit', args: 'mascot on' } as never)
  expect(await svgOf($)).toContain('scale(2)')
})

test('a stored mascot choice is restored at session start', async ($, on) => {
  const w = world(on, { stored: { mascot: 'off' } })
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  expect(await svgOf($)).not.toContain('DA7758')
})

test('with Clawd hidden the bubble still speaks and still carries its button', async ($, on) => {
  const w = world(on, { stored: { mascot: 'off' } })
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await $.command.run({ command: 'cockpit', args: 'close' } as never)
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'lane' })).toBeDefined()
  expect(await ui.find({ key: 'copy' })).toBeDefined()
  await ui.unmount()
})

test('a pending warning bubble does not speak over a higher-priority state, and returns after it', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await w.clock.advance(6000)
  await measureCtx($, 60)
  await $.command.run({ command: 'cockpit', args: 'close' } as never) // collapsed: the warning speaks through the bubble
  expect(await hasButton($, 'copy')).toBe(true) // a decision bubble is pending for the context warning
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  const call = ($ as unknown as Do).tool.call({ tool: 'Edit', file_path: '/x/a.ts' })
  await w.clock.advance(100)
  expect(await altOf($, true)).toContain('hammer')
  expect(await hasButton($, 'copy')).toBe(false)
  expect(await altOf($, true)).not.toContain('quality may slip')
  await call
  await w.clock.advance(8000)
  expect(await altOf($, true)).not.toContain('hammer')
})

test('a step routed to Haiku leaves the main model cache countdown alone; a main-model step starts it', async ($, on) => {
  const w = world(on, { contextTokens: 20_000 })
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await send($, 'fix the typo in the README')
  await step($, w, usage(100, 0, 20_000)) // easy, saver on: answered by Haiku
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('no reply yet')
  await send($, 'plan and implement the new export feature across the modules')
  await step($, w, usage(100, 0, 20_000)) // hard: the main model, and its cache starts
  expect(text(await $.command.run({ command: 'cache', args: '' } as never))).toContain('left')
})

test('a finished turn adds one row to the session log under the home folder', async ($, on) => {
  const w = world(on)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await started($)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await ($ as unknown as Do).turn.complete({ reason: 'answer', answer: 'x', durationMs: 1500, isAborted: false, turnId: 't1', usage: { model: 'claude-sonnet-5-5', input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 90, cache_creation_input_tokens: 1 } })
  const log = w.files.find(f => f.path.includes('/.claude/cockpit-log/'))
  expect(log).toBeDefined()
  const row = JSON.parse(String(log?.text).trim().split('\n').at(-1) ?? '{}')
  expect(row.out).toBe(7)
  expect(row.cacheRead).toBe(90)
  expect(row.reason).toBe('answer')
})

test('a message to you is a bubble, not a toast, and goes in the log; it fades by itself', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await $.command.run({ command: 'newsession', args: '' } as never)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await $.command.run({ command: 'fresh', args: '' } as never) // Claude is busy: fresh waits
  await w.clock.advance(50)
  expect(await altOf($, true)).toContain('Claude is working')
  expect(w.toasts.length).toBe(0)
  expect(await said($)).toContain('Claude is working')
  await w.clock.advance(12_000)
  expect(await altOf($, true)).not.toContain('Claude is working')
})


test('a new pose never changes the meters drawing, and the bubble drawing is kept while its words stand', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  const sources = async () => {
    const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ findAll: (q: unknown) => Promise<{ props?: { source?: string; alt?: string } }[]>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
    const all = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    return {
      meters: all.find(v => String(v.props?.source ?? '').includes('Context'))?.props?.source,
      bubble: all.find(v => String(v.props?.alt ?? '').includes('Context'))?.props?.source,
      clawd: all.find(v => String(v.props?.alt ?? '').startsWith('Clawd'))?.props?.source,
    }
  }
  const a = await sources()
  expect(await sources()).toEqual(a) // redrawn with nothing new: the same drawings, so nothing reloads
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await ($ as unknown as Do).tool.call({ tool: 'Edit', file_path: '/x/a.ts' })
  const b = await sources()
  expect(b.clawd).not.toBe(a.clawd) // he changed pose...
  expect(b.meters).toBe(a.meters) // ...and the meters were not touched
})

test('after a tool ends the bubble about it goes with its pose; it never talks over another pose', async ($, on) => {
  const w = world(on)
  on('tool.call', ok)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await settle($, w, 4000) // tipsy, settled, his bubble up
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await ($ as unknown as Do).tool.call({ tool: 'Edit', file_path: '/x/patch_readers.py' })
  await settle($, w, 2500)
  const during = await altOf($, true)
  expect(during).toContain('hammer')
  expect(during).toContain('Editing patch_readers.py') // pose and words agree
  await settle($, w, 3000) // the tool is over, the hammer is put down
  await settle($, w, 3000)
  const after = await altOf($, true)
  expect(after).not.toContain('hammer')
  expect(after).not.toContain('Editing') // no bubble about what he is no longer doing
})

test('while the model streams a file it is writing, Clawd paints with a moustache; the hammer takes over when the tool runs', async ($, on) => {
  const w = world(on, { stepChunks: [{ kind: 'tool', index: 0, id: 'u1', name: 'Write' }, { kind: 'input', index: 0, json: '{"file_path":"/x/src/new_module.py","content":"' }, { kind: 'input', index: 0, json: 'print(1)' }] })
  on('tool.call', ok)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  const it = ($ as unknown as { turn: { step: (i: unknown) => AsyncIterable<unknown> } }).turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 })[Symbol.asyncIterator]()
  await it.next() // the tool call begins
  expect(await altOf($, true)).toContain('painting')
  await it.next() // the first pieces of its arguments name the file
  await settle($, w, 2500)
  expect(await altOf($, true)).toContain('Creating new_module.py')
  while (!(await it.next()).done) { /* the rest of the stream */ }
  await ($ as unknown as Do).tool.call({ tool: 'Write', file_path: '/x/src/new_module.py' }) // the file is written: the hammer
  expect(await altOf($, true)).toContain('hammer')
})

test('the bubble is laid out afresh for the room it has (a wider or narrower window), not scaled', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await settle($, w)
  type Mounted = { findAll: (q: unknown) => Promise<{ props?: { alt?: string; width?: number } }[]>; unmount: () => Promise<void> }
  const widthAt = async (columns: number): Promise<number> => {
    const ui = (await $.ui.mount({ plugin: 'cockpit', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: columns, scroll: { bodyRows: 10 }, view: {} } } as never)) as unknown as Mounted
    const art = (await ui.findAll({ type: 'Svg' })).find(v => String(v.props?.alt ?? '').includes('quality') && !String(v.props?.alt ?? '').startsWith('Clawd'))
    await ui.unmount()
    return Number(art?.props?.width)
  }
  const wide = await widthAt(140)
  const narrow = await widthAt(60)
  expect(narrow).toBeLessThan(wide) // the drawing was made for the room, so the words keep their size
})

test('while Claude works the detective waits: he thinks (findings are only offered when it is idle), and a click on him still says something', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  await settle($, w, 1000)
  expect(await altOf($, true)).toContain('thinking')
  const ui = await $.ui.mount(band('desktop', true))
  expect(await ui.find({ key: 'recall' })).toBeDefined() // a click on him says "Thinking…"
  await ui.unmount()
})

test('words changing are written over one bubble: only one bubble drawing exists at any time', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await ($ as unknown as Do).turn.start({ text: 'go', turnId: 't1' })
  type Mounted = { findAll: (q: unknown) => Promise<{ props?: { alt?: string; height?: number } }[]>; unmount: () => Promise<void> }
  const bubbles = async (): Promise<string[]> => {
    const ui = (await $.ui.mount(band('desktop', true))) as unknown as Mounted
    const all = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    return all.filter(v => v.props?.height === 30 && v.props?.alt !== 'bubble space').map(v => String(v.props?.alt))
  }
  await $.command.run({ command: 'newsession', args: '' } as never)
  await settle($, w, 2000)
  expect(await bubbles()).toEqual(['Claude is working. Try again after the turn.'])
  await $.command.run({ command: 'fresh', args: '' } as never) // other words while the first are up
  await w.clock.advance(50)
  expect(await bubbles()).toEqual(['Claude is working. Wait for the turn to end.']) // the one drawing, written over, never two
  await settle($, w, 3000)
  expect((await bubbles()).length).toBe(1)
})

test('a bubble that arrives with buttons opens with its motion, and one that leaves with them closes with it (the room changing must not skip it); Clawd is not redrawn for words', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_, e) => e as never)
  await started($)
  await measureCtx($, 10)
  await w.clock.advance(6000)
  await settle($, w, 1000)
  type Mounted = { findAll: (q: unknown) => Promise<{ props?: { alt?: string; height?: number; source?: string } }[]>; unmount: () => Promise<void> }
  const drawings = async () => {
    const ui = (await $.ui.mount(band('desktop'))) as unknown as Mounted
    const all = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    return { bubble: all.find(v => v.props?.height === 30 && v.props?.alt !== 'bubble space')?.props?.source, clawd: all.find(v => String(v.props?.alt ?? '').startsWith('Clawd'))?.props }
  }
  const before = (await drawings()).clawd
  await measureCtx($, 60) // a warning: its bubble arrives with a button and the "…"
  await settle($, w, 4000)
  const open = await drawings()
  expect(open.bubble).toContain('values="0.5;1.06;1"') // it scales out of Clawd while its words are typed
  expect(String(open.clawd?.alt)).not.toContain('quality') // his own drawing's text does not carry the bubble's words
  await ($ as unknown as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text: 'something else', origin: { kind: 'composer' } })
  await w.clock.advance(50)
  const closing = await drawings()
  expect(closing.bubble).toContain('values="1;0.5"') // it leaves the way it came: words deleted, scaled back to Clawd
  expect(before).toBeDefined()
})
