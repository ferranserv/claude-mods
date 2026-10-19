import { expect, mock, test } from 'claude-code/testing'

// Another mod's band beneath this one must still show: the panel stacks under it, never replaces it.
test('stacks under another mod\'s band instead of replacing it', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('ui.render', ($2, e) => {
    const { Text } = $2.ui.resolve(e)
    return <Text>OTHER-MOD-BAND</Text>
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write schema', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build API', description: 'd' } as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'plan-progress',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} },
    } as never)
    expect(await ui.find({ type: 'Text', text: /OTHER-MOD-BAND/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /steps/ })).toBeDefined()
    await ui.unmount()
  }
})
