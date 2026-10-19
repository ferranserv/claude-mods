import { expect, test } from 'claude-code/testing'

import type { PlanSnap } from '../types'
import {
  EMPTY,
  applyGoalCommand,
  applyPrompt,
  applyTool,
  applyTurnEnd,
  bar,
  fmtTime,
  isAllDone,
  percent,
  phaseFromSubject,
  toolPhase,
  windowTasks,
} from '../hooks/logic'

const ctx = { now: 10_000, promptAt: 4_000, promptText: 'Build the importer\nwith tests' }

test('task list builds, ticks off and drives percent', async () => {
  let s: PlanSnap = EMPTY
  s = applyTool(s, 'TaskCreate', { subject: 'Write schema', description: '' }, { task: { id: '1', subject: 'Write schema' } }, ctx)
  s = applyTool(s, 'TaskCreate', { subject: 'Test importer', description: '' }, { task: { id: '2', subject: 'Test importer' } }, ctx)
  expect(s.tasks.length).toBe(2)
  expect(s.startedAt).toBe(4_000)
  expect(s.goal).toBe('Build the importer')
  expect(percent(s)).toBe(0)

  s = applyTool(s, 'TaskUpdate', { taskId: '1', status: 'completed' }, {}, ctx)
  expect(percent(s)).toBe(50)
  s = applyTool(s, 'TaskUpdate', { taskId: '2', status: 'in_progress' }, {}, ctx)
  expect(s.phase).toBe('testing')
  s = applyTool(s, 'TaskUpdate', { taskId: '2', status: 'completed' }, {}, ctx)
  expect(isAllDone(s)).toBe(true)
  expect(percent(s)).toBe(100)
})

test('TodoWrite replaces the whole list and deleted tasks drop out', async () => {
  let s = applyTool(
    EMPTY,
    'TodoWrite',
    { todos: [{ content: 'Research API', status: 'in_progress', activeForm: 'Researching' }, { content: 'Implement', status: 'pending', activeForm: 'x' }] },
    {},
    ctx,
  )
  expect(s.tasks.map(t => t.status)).toEqual(['in_progress', 'pending'])
  expect(s.phase).toBe('researching')
  s = applyTool(s, 'TaskUpdate', { taskId: '2', status: 'deleted' }, {}, ctx)
  expect(s.tasks.length).toBe(1)
})

test('phases follow tools, and reads never regress a build', async () => {
  expect(toolPhase('Grep', {}, 'researching')).toBe('researching')
  expect(toolPhase('Read', {}, 'building')).toBeUndefined()
  expect(toolPhase('Edit', {}, 'researching')).toBe('building')
  expect(toolPhase('Bash', { command: 'npm run test -- --watch=false' }, 'building')).toBe('testing')
  expect(toolPhase('Bash', { command: 'ls -la' }, 'building')).toBeUndefined()
  expect(toolPhase('Skill', { skill: 'code-review' }, 'testing')).toBe('auditing')
  expect(toolPhase('Agent', { subagent_type: 'general-purpose', description: 'security audit' }, 'building')).toBe('auditing')
  expect(phaseFromSubject('Design the schema')).toBe('planning')
})

test('goal command sets, clears, and survives a finished task list', async () => {
  let s = applyGoalCommand(EMPTY, 'all tests in test/auth pass', ctx)
  expect(s.isGoalCmd).toBe(true)
  expect(s.goal).toBe('all tests in test/auth pass')
  s = applyTurnEnd(s, 20_000)
  expect(s.isRunning).toBe(false)
  expect(applyPrompt(s, ctx).isRunning).toBe(true)
  expect(applyGoalCommand(s, 'clear', ctx)).toEqual(EMPTY)
})

test('a finished plain task list resets on the next prompt', async () => {
  let s = applyTool(EMPTY, 'TaskCreate', { subject: 'a' }, { task: { id: '1', subject: 'a' } }, ctx)
  s = applyTool(s, 'TaskUpdate', { taskId: '1', status: 'completed' }, {}, ctx)
  expect(applyPrompt(s, ctx)).toEqual(EMPTY)
})

test('window keeps the first unfinished step in view', async () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ id: String(i), subject: `s${i}`, status: i < 6 ? ('completed' as const) : ('pending' as const) }))
  const { shown, hidden } = windowTasks(tasks, 4)
  expect(shown.some(t => t.id === '6')).toBe(true)
  expect(shown.length + hidden).toBe(10)
  expect(windowTasks(tasks.slice(0, 3), 5).hidden).toBe(0)
})

test('formatting', async () => {
  expect(fmtTime(59_000)).toBe('59s')
  expect(fmtTime(252_000)).toBe('4m12s')
  expect(fmtTime(3_900_000)).toBe('1h05m')
  expect(bar(50, 10)).toBe('█████░░░░░')
})

import { norm } from '../hooks/logic'

test('tool names are read the same however they are spelled; other plan shapes work', async () => {
  expect(norm('task_create')).toBe('taskcreate')
  expect(norm('Task-Update')).toBe('taskupdate')
  let s: PlanSnap = EMPTY
  s = applyTool(s, 'task_create', { title: 'Plan it' }, { task: { id: 7, subject: 'Plan it' } }, ctx)
  expect(s.tasks[0]?.id).toBe('7')
  s = applyTool(s, 'task_update', { id: 7, status: 'in-progress' }, {}, ctx)
  expect(s.tasks[0]?.status).toBe('in_progress')
  s = applyTool(s, 'update_plan', { plan: [{ step: 'Read code', status: 'completed' }, { step: 'Write tests', status: 'in_progress' }, { step: 'Ship', status: 'pending' }] }, {}, ctx)
  expect(s.tasks.map(t => t.status)).toEqual(['completed', 'in_progress', 'pending'])
  expect(s.phase).toBe('testing')
})

test('without an id in the result, new tasks get 1, 2, 3 so TaskUpdate "2" finds them', async () => {
  let s: PlanSnap = EMPTY
  s = applyTool(s, 'TaskCreate', { subject: 'a' }, undefined, ctx)
  s = applyTool(s, 'TaskCreate', { subject: 'b' }, 'Task created', ctx)
  s = applyTool(s, 'TaskUpdate', { taskId: '2', status: 'completed' }, {}, ctx)
  expect(s.tasks.map(t => [t.id, t.status])).toEqual([['1', 'pending'], ['2', 'completed']])
})
