import { expect, mock, test } from 'claude-code/testing'

const props = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} }

async function seed($: { tool: { call: (i: unknown) => Promise<unknown> } }) {
  await $.tool.call({ tool: 'TaskCreate', subject: 'Research', description: 'd' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build', description: 'd' })
}

test('the x button clears the panel on both surfaces', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    await $.command.run({ command: 'plan-reset', args: '' } as never)
    await seed($ as never)
    const ui = await $.ui.mount({ plugin: 'plan-progress', surface, component: 'AbovePrompt', props } as never)
    expect(await ui.find({ key: 'dismiss' })).toBeDefined()
    await ui.press({ key: 'dismiss' })
    await ui.unmount()
    const after = await $.ui.mount({ plugin: 'plan-progress', surface, component: 'AbovePrompt', props } as never)
    expect(await after.find({ key: 'dismiss' })).toBeUndefined()
    await after.unmount()
  }
})

test('a turn that ended shows idle, not the last phase as if it were running', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await seed($ as never)
  await ($ as unknown as { turn: { complete: (i: unknown) => Promise<unknown> } }).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't' })
  const ui = await $.ui.mount({ plugin: 'plan-progress', surface: 'terminal', component: 'AbovePrompt', props } as never)
  expect(await ui.find({ type: 'Text', text: /idle/ })).toBeDefined()
  await ui.unmount()
})

test('/plan-debug says which tools it has seen and what it holds', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'x' }) as never)
  await seed($ as never)
  await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
  const r = (await $.command.run({ command: 'plan-debug', args: '' } as never)) as { text: string }
  expect(r.text).toContain('TaskCreatex2')
  expect(r.text).toContain('Readx1')
  expect(r.text).toContain('Task list: 2')
})
