import { expect, mock, test } from 'claude-code/testing'

// Another mod's band beneath this one must still show: the Enhance row stacks under it, never replaces it.
test('stacks under another mod\'s band instead of replacing it', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('prompt.edit', (_$, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  on('ui.render', ($2, e) => {
    const { Text } = $2.ui.resolve(e)
    return <Text>OTHER-MOD-BAND</Text>
  })
  await (($ as unknown) as { prompt: { edit: (i: unknown) => Promise<unknown> } }).prompt.edit({
    origin: { kind: 'composer' }, key: { key: 'x' }, text: 'a draft', cursor: 7, start: 7, end: 7, inputText: 'x',
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'prompt-enhancer',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} },
    } as never)
    expect(await ui.find({ type: 'Text', text: /OTHER-MOD-BAND/ })).toBeDefined()
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    await ui.unmount()
  }
})

test('the sparkle is there before you type anything, dimmed', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'prompt-enhancer',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} },
    } as never)
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    await ui.unmount()
  }
})
