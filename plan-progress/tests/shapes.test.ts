import { expect, test } from 'claude-code/testing'

import type { PlanSnap } from '../types'
import { EMPTY, applyTool, applyTurnEnd, applyTurnStart, extractList } from '../hooks/logic'

const ctx = { now: 10_000, promptAt: 4_000, promptText: 'Goal here' }

test('any plan-like tool with a list of {text, status} objects fills the checklist', async () => {
  const shapes: [string, Record<string, unknown>][] = [
    ['update_plan', { explanation: 'x', plan: [{ step: 'A', status: 'completed' }, { step: 'B', status: 'in_progress' }] }],
    ['TodoWrite', { todos: [{ content: 'A', status: 'completed', activeForm: 'Doing A' }, { content: 'B', status: 'in_progress', activeForm: 'Doing B' }] }],
    ['plan_tasks', { items: [{ title: 'A', status: 'done' }, { title: 'B', status: 'doing' }] }],
    ['TaskList', { tasks: [{ subject: 'A', status: 'completed' }, { subject: 'B', status: 'in_progress' }] }],
    ['update_todos', { list: [{ text: 'A', status: 'Completed' }, { text: 'B', status: 'In Progress' }] }],
  ]
  for (const [tool, input] of shapes) {
    const s = applyTool(EMPTY, tool, input, {}, ctx)
    expect(s.tasks.map(t => t.status)).toEqual(['completed', 'in_progress'])
    expect(s.tasks.map(t => t.subject)).toEqual(['A', 'B'])
  }
})

test('arrays that are not task lists are ignored, so ordinary tools never make a checklist', async () => {
  expect(extractList({ files: ['a', 'b'] })).toBeUndefined()
  expect(extractList({ edits: [{ old: 'a', new: 'b' }] })).toBeUndefined()
  expect(extractList({ plan: [] })).toBeUndefined()
  expect(applyTool(EMPTY, 'Edit', { edits: [{ text: 'x', status: 'ok' }] }, {}, ctx)).toBe(EMPTY) // not a plan-like name
})

test('phases you have left are remembered as visited', async () => {
  let s: PlanSnap = applyTool(EMPTY, 'update_plan', { plan: [{ step: 'Research the API', status: 'in_progress' }, { step: 'Write tests', status: 'pending' }] }, {}, ctx)
  expect(s.phase).toBe('researching')
  expect(s.visited).toEqual(['researching'])
  s = applyTool(s, 'update_plan', { plan: [{ step: 'Research the API', status: 'completed' }, { step: 'Write tests', status: 'in_progress' }] }, {}, ctx)
  expect(s.phase).toBe('testing')
  expect(s.visited).toEqual(['researching', 'testing'])
})

test('a new turn starts the clock again (a goal continuation is not a typed prompt)', async () => {
  let s: PlanSnap = applyTool(EMPTY, 'update_plan', { plan: [{ step: 'A', status: 'in_progress' }, { step: 'B', status: 'pending' }] }, {}, ctx)
  s = applyTurnEnd(s, 65_000)
  expect(s.isRunning).toBe(false)
  const again = applyTurnStart(s)
  expect(again.isRunning).toBe(true)
  expect(again.endedAt).toBe(0)
  expect(applyTurnStart(EMPTY)).toBe(EMPTY) // nothing to run
})
