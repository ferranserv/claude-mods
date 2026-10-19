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
