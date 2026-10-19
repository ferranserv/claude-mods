import { expect, mock, test } from 'claude-code/testing'

// Another mod's band beneath saver must still show: saver stacks under it, never replaces it.
test('stacks under another mod\'s band instead of replacing it', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', () => ({ value: undefined }) as never)
  on('ui.render', ($2, e) => {
    const { Text } = $2.ui.resolve(e)
    return <Text>OTHER-MOD-BAND</Text>
  })

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

test('saver draws its strip and nothing else (the rule under the bars belongs to meters)', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 9, 21, 12).getTime() })
  on('store.get', () => ({ value: undefined }) as never)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'saver', surface, component: 'AbovePrompt', props } as never)
    expect(await ui.find({ type: 'Text', text: /Saver/ })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
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
