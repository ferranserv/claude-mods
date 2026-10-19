import { expect, mock, test } from 'claude-code/testing'

const started = ($: unknown) => ($ as { session: { start: (i: unknown) => Promise<unknown> } }).session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

// Another mod's band beneath saver must still show: saver stacks under it, never replaces it.
test('stacks under another mod\'s band instead of replacing it', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', () => ({ value: 'always' }) as never)
  on('command.register', () => ({ value: { command: 'saver' } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('ui.render', ($2, e) => {
    const { Text } = $2.ui.resolve(e)
    return <Text>OTHER-MOD-BAND</Text>
  })
  await started($)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'saver',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} },
    } as never)
    expect(await ui.find({ type: 'Text', text: /OTHER-MOD-BAND/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Saver/ })).toBeDefined()
    await ui.unmount()
  }
})

const props = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} }

test('the strip comes with a rule above it, and with no strip there is no rule', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', () => ({ value: 'always' }) as never)
  on('command.register', () => ({ value: { command: 'saver' } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'saver', surface, component: 'AbovePrompt', props } as never)
    expect(await ui.find({ type: 'Text', text: /Saver/ })).toBeDefined()
    expect(await ui.find((surface === 'desktop' ? { type: 'Svg' } : { type: 'Text', text: /^─+$/ }) as never)).toBeDefined()
    await ui.unmount()
  }
})

test('/saver why says what the last decision was and why', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('prompt.submit', (_, e) => e as never)
  const why = async () => String(((await $.command.run({ command: 'saver', args: 'why' } as never)) as { text: string }).text)
  expect(await why()).toContain('No prompt seen')
  await $.command.run({ command: 'saver', args: 'off' } as never)
  await ($ as unknown as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text: 'fix the typo in: teh cat', origin: { kind: 'composer' } })
  expect(await why()).toContain('Saver is off')
})

// ---- when the strip shows ----

function world(on: Parameters<typeof mock.clock>[0], stored: Record<string, unknown> = {}) {
  const writes: Record<string, unknown> = {}
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', (_, e) => ({ value: e.key in writes ? writes[e.key] : stored[e.key] }) as never)
  on('store.set', (_, e) => {
    writes[e.key] = e.value
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: { command: 'saver' } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('prompt.submit', (_, e) => e as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000, percent: 0 }, rateLimits: [] } }) as never)
  on('turn.step', async function* (_: unknown, e: { model: string }) {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model } } as never
  } as never)
  return writes
}

const shown = async ($: { ui: { mount: (a: never) => Promise<{ find: (q: never) => Promise<unknown>; unmount: () => Promise<void> }> } }, surface: 'desktop' | 'terminal' = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'saver', surface, component: 'AbovePrompt', props } as never)
  const has = (await ui.find({ type: 'Text', text: /Saver/ } as never)) !== undefined
  await ui.unmount()
  return has
}

const send = ($: unknown, text: string) => ($ as { prompt: { submit: (i: unknown) => Promise<unknown> } }).prompt.submit({ text, origin: { kind: 'composer' } })
const step = async ($: unknown, model: string) => {
  for await (const chunk of ($ as { turn: { step: (i: unknown) => AsyncIterable<unknown> } }).turn.step({ turnId: 't', index: 0, model, messageCount: 1 })) void chunk
}

test('by default the strip is hidden until saver routes an answer to Haiku, and hides again when it does not', async ($, on) => {
  world(on)
  await started($)
  expect(await shown($ as never)).toBe(false) // on, but nothing routed yet

  await send($, 'fix the typo in: teh cat')
  await step($, 'claude-sonnet-5-5')
  expect(await shown($ as never)).toBe(true) // the easy prompt went to Haiku
  expect(await shown($ as never, 'desktop')).toBe(true)

  await send($, 'plan a refactor of the login module in 5 steps')
  await step($, 'claude-sonnet-5-5')
  expect(await shown($ as never)).toBe(false) // a hard one stayed on your model
})

test('off hides the strip in the default mode', async ($, on) => {
  world(on)
  await started($)
  await send($, 'fix the typo in: teh cat')
  await step($, 'claude-sonnet-5-5')
  expect(await shown($ as never)).toBe(true)
  await $.command.run({ command: 'saver', args: 'off' } as never)
  expect(await shown($ as never)).toBe(false)
})

test('/saver strip on: whenever saver is on; always: even when off; bad words explain', async ($, on) => {
  const w = world(on)
  await started($)
  const r = (args: string) => $.command.run({ command: 'saver', args } as never).then(x => String((x as { text: string }).text))
  expect(await r('strip on')).toContain('whenever saver is on')
  expect(w.stripMode).toBe('on')
  expect(await shown($ as never)).toBe(true)
  await $.command.run({ command: 'saver', args: 'off' } as never)
  expect(await shown($ as never)).toBe(false)
  expect(await r('strip always')).toContain('even when off')
  expect(await shown($ as never)).toBe(true)
  expect(await r('strip sometimes')).toContain('Use /saver strip active')
  expect(await r('strip active')).toContain('only when the last answer')
  expect(await r('')).toContain('the strip shows active')
})

test('the chosen strip mode comes back at the next session start', async ($, on) => {
  world(on, { stripMode: 'always' })
  await started($)
  expect(await shown($ as never)).toBe(true)
})

test('nothing is routed when the session model is already Haiku, so the default strip stays hidden', async ($, on) => {
  world(on)
  await started($)
  await send($, 'fix the typo in: teh cat')
  await step($, 'claude-haiku-5-5')
  expect(await shown($ as never)).toBe(false)
  expect(String(((await $.command.run({ command: 'saver', args: 'why' } as never)) as { text: string }).text)).toContain('already')
})

test('hidden strip means no rule either', async ($, on) => {
  world(on)
  await started($)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'saver', surface, component: 'AbovePrompt', props } as never)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
    await ui.unmount()
  }
})
