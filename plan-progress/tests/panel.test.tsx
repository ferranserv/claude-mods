import { expect, mock, test } from 'claude-code/testing'

const BAND = (bodyColumns: number): Record<string, unknown> =>
  ({
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 12,
      bodyColumns,
      scroll: { bodyRows: 12 },
      view: {},
    },
  })

test('panel shows goal, phase, bar, percent and checklist on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true } }) as never)

  await $.tool.call({ tool: 'TaskCreate', subject: 'Write schema', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build API', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Write schema', status: 'completed' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'plan-progress', surface, ...BAND(80) } as never)
    expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/2 steps/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Build API/ })).toBeDefined()
    await ui.unmount()
  }
})
