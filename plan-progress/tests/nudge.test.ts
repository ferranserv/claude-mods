import { expect, mock, test } from 'claude-code/testing'

type Classic = { classic: { PostToolUse: (i: unknown) => Promise<{ additionalContext?: string[] } | undefined> } }

const read = (id: string) => ({ tool_name: 'Read', tool_input: { file_path: '/a' }, tool_response: 'x', tool_use_id: id })

async function seed($: { tool: { call: (i: unknown) => Promise<unknown> } }) {
  await $.tool.call({ tool: 'TaskCreate', subject: 'Research', description: 'd' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build', description: 'd' })
}

test('after enough tool calls without a task update the model gets one reminder, then quiet', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('classic.PostToolUse', () => ({}) as never)
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  await seed($ as never)
  const c = ($ as unknown as Classic).classic
  const notes: string[] = []
  for (let i = 0; i < 10; i++) notes.push(...((await c.PostToolUse(read(`t${i}`)))?.additionalContext ?? []))
  expect(notes.length).toBe(1)
  expect(notes[0]).toContain('0/2')
  for (let i = 0; i < 9; i++) notes.push(...((await c.PostToolUse(read(`u${i}`)))?.additionalContext ?? []))
  expect(notes.length).toBe(1)
})

test('a task update resets the count, and no checklist means no reminder', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('classic.PostToolUse', () => ({}) as never)
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  const c = ($ as unknown as Classic).classic
  for (let i = 0; i < 12; i++) expect((await c.PostToolUse(read(`a${i}`)))?.additionalContext).toBeUndefined()
  await seed($ as never)
  for (let i = 0; i < 9; i++) await c.PostToolUse(read(`b${i}`))
  await c.PostToolUse({ tool_name: 'TaskUpdate', tool_input: { taskId: 'Research', status: 'completed' }, tool_response: 'ok', tool_use_id: 'x' })
  for (let i = 0; i < 9; i++) expect((await c.PostToolUse(read(`c${i}`)))?.additionalContext).toBeUndefined()
})
