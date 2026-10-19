import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 12 }, view: {} },
}

test('panel shows goal, phase, bar, percent and checklist on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true } }) as never)

  await $.tool.call({ tool: 'TaskCreate', subject: 'Write schema', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build API', description: 'd' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'Write schema', status: 'completed' } as never)

  const ui = await $.ui.mount({ plugin: 'plan-progress', surface: 'terminal', component: 'AbovePrompt', props: BAND.props, } as never)
  expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/2 steps/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Build API/ })).toBeDefined()
  await ui.unmount()

  const d = await $.ui.mount({ plugin: 'plan-progress', surface: 'desktop', component: 'AbovePrompt', props: BAND.props } as never)
  const svg = (await d.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
  expect(svg).toBeDefined()
  const source = String(svg?.props?.source)
  expect(source).toContain('50% · 1/2 steps')
  expect(source).toContain('Build API')
  expect(source).toContain('Write schema')
  expect(source).not.toContain('NaN')
  await d.unmount()
})
