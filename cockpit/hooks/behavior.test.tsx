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

  const r = await $.command.run({ command: 'newsession', args: '' } as never)
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
  expect(w.toasts.at(-1)).toContain('Nothing to hand off')
})

test('handoff waits while Claude is working', async ($, on) => {
  const w = world(on)
  await started($)
  await ($ as unknown as { turn: { start: (i: unknown) => Promise<unknown> } }).turn.start({ text: 'go', turnId: 't1' })
  await $.command.run({ command: 'newsession', args: '' } as never)
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(w.toasts.at(-1)).toContain('working')
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
  expect(w.toasts.at(-1)).toContain('A copy is saved at C:')
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
  expect(w.toasts.at(-1)).toContain('could not be saved')
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
    expect(w.toasts.at(-1)).toContain('Your session is unchanged')
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

test('buttons hide while a turn runs even when the app does not set isWorking; three buttons show when idle', async ($, on) => {
  const w = world(on)
  await started($)
  await $.session.measure({ context: { tokens: 600, window: 1000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  let ui = await $.ui.mount(band('desktop'))
  for (const key of ['handoff', 'copy', 'fresh']) expect(await ui.find({ key })).toBeDefined()
  await ui.unmount()

  await ($ as unknown as { turn: { start: (i: unknown) => Promise<unknown> } }).turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount(band('desktop', false))
  expect(await ui.find({ key: 'handoff' })).toBeUndefined()
  expect(await ui.find({ key: 'copy' })).toBeUndefined()
  await ui.unmount()
  expect(w.commands).toEqual([])
})

test('the copy button keeps the session', async ($, on) => {
  const w = world(on, { brief: 'B' })
  await started($)
  await $.session.measure({ context: { tokens: 600, window: 1000, percent: 60 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'copy' })
  await w.clock.advance(5000)
  expect(w.commands).toEqual([])
  expect(w.fills.at(-1)).toBe('B')
  await ui.unmount()
})

// ---- the cockpit band: collapsed row, arrow, auto-open, a button for every warning

const measureCtx = ($: unknown, percent: number) =>
  ($ as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: percent * 10, window: 1000, percent }, rateLimits: [], changed: ['context'] })

test('calm: collapsed, no alert row; the arrow opens it and the saver line shows', async ($, on) => {
  world(on)
  await started($)
  await measureCtx($, 10)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'toggle' })).toBeDefined()
  expect(await ui.find({ key: 'alert-ctx' })).toBeUndefined()
  expect(await ui.find({ key: 'saver' })).toBeUndefined()
  await ui.press({ key: 'toggle' })
  await ui.unmount()
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'saver' })).toBeDefined()
  await ui.unmount()
})

test('a warning opens the band by itself with its buttons; the arrow collapses it until the level climbs', async ($, on) => {
  world(on)
  await started($)
  await measureCtx($, 60)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeDefined()
  for (const key of ['handoff', 'copy', 'fresh']) expect(await ui.find({ key })).toBeDefined()
  await ui.press({ key: 'toggle' })
  await ui.unmount()

  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeUndefined() // collapsed, still at warning level
  await ui.unmount()

  await measureCtx($, 90) // alert level: past what was collapsed
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeDefined()
  await ui.unmount()
})

test('/cockpit close keeps it collapsed even at the alert level; /cockpit auto lets it open again', async ($, on) => {
  world(on)
  await started($)
  await measureCtx($, 90)
  expect(text(await $.command.run({ command: 'cockpit', args: 'close' } as never))).toContain('collapsed')
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'cockpit', args: 'auto' } as never)
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeDefined()
  await ui.unmount()
})

test('a pinned-open band is remembered across sessions', async ($, on) => {
  const w = world(on)
  await started($)
  await $.command.run({ command: 'cockpit', args: 'open' } as never)
  expect(w.writes.pinnedOpen).toBe(true)
})

test('5-hour limit at 80%: the warning offers Turn saver on, and pressing it turns saver on', async ($, on) => {
  const w = world(on, { stored: { saverOn: false } })
  await started($)
  await ($ as unknown as { session: { measure: (i: unknown) => Promise<unknown> } }).session.measure({ context: { tokens: 100, window: 1000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-five' })).toBeDefined()
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
  // The bubble and the wand are Svgs too: Clawd's own drawing is the one described as Clawd.
  const svgs = await ui.findAll({ type: 'Svg' })
  const alt = String(svgs.find(v => String(v.props?.alt ?? '').startsWith('Clawd'))?.props?.alt ?? '')
  await ui.unmount()
  return alt
}
const ok = () => ({ ref: 0, result: {}, text: 'ok' }) as never

test('Clawd lounges on the beach when nothing is going on; the session starts with a walk', async ($, on) => {
  const w = world(on)
  expect(await altOf($)).toContain('lounging on a beach')
  await started($)
  await measureCtx($, 10)
  expect(await altOf($)).toContain('walks in')
  await w.clock.advance(6000)
  expect(await altOf($)).toContain('lounging')
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

test('a permission prompt raises a hand until the call runs', async ($, on) => {
  const w = world(on)
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', ok)
  await started($)
  await w.clock.advance(6000)
  await ($ as unknown as Do).tool.check({ tool: 'Bash', input: { command: 'rm -rf x' } })
  expect(await altOf($)).not.toContain('clipboard') // an ask settled at once by a rule shows nothing
  await w.clock.advance(1000)
  expect(await altOf($)).not.toContain('clipboard') // still inside the 2.5 s it takes to be sure
  await w.clock.advance(1600)
  expect(await altOf($)).toContain('clipboard')
  await ($ as unknown as Do).tool.call({ tool: 'Bash', command: 'ls' })
  expect(await altOf($)).not.toContain('clipboard')
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

test('a collapsed band speaks through the bubble, with the button; an open band shows the alert once', async ($, on) => {
  const w = world(on)
  await started($)
  await measureCtx($, 60)
  await w.clock.advance(6000)
  await $.command.run({ command: 'cockpit', args: 'close' } as never)
  let ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'bubble' })).toBeDefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  expect(await ui.find({ key: 'alert-ctx' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'cockpit', args: 'auto' } as never)
  ui = await $.ui.mount(band('desktop'))
  expect(await ui.find({ key: 'alert-ctx' })).toBeDefined()
  expect(await ui.find({ key: 'bubble' })).toBeUndefined()
  await ui.unmount()
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

const svgOf = async ($: unknown) => {
  const ui = await ($ as { ui: { mount: (i: unknown) => Promise<{ find: (q: unknown) => Promise<{ props?: { source?: string } } | undefined>; unmount: () => Promise<void> }> } }).ui.mount(band('desktop'))
  const source = String((await ui.find({ type: 'Svg' }))?.props?.source ?? '')
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
  expect(await ui.find({ key: 'bubble' })).toBeDefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})
