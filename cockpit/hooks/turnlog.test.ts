import { expect, test } from 'claude-code/testing'

import { MAX_LINES, logPath, turnRow, withRow } from './turnlog'

test('a row carries the turn: tokens, model, routing, duration, context', () => {
  const r = JSON.parse(turnRow({ now: Date.UTC(2026, 9, 21, 12), session: 's1', reason: 'answer', ms: 1234.6, usage: { model: 'claude-sonnet-5-5', input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 4 }, routed: true, ctxPercent: 41.7 }))
  expect(r).toEqual({ t: '2026-10-21T12:00:00.000Z', session: 's1', reason: 'answer', ms: 1235, model: 'claude-sonnet-5-5', in: 10, out: 20, cacheRead: 300, cacheWrite: 4, routed: true, ctx: 42 })
})

test('a turn with no usage (an interrupt) still logs, with zeros', () => {
  const r = JSON.parse(turnRow({ now: 0, session: 's', reason: 'aborted', ms: 5, routed: false, ctxPercent: null }))
  expect(r.in).toBe(0)
  expect(r.model).toBe('')
  expect(r.ctx).toBeNull()
})

test('the path is under the home folder and the session id cannot escape it', () => {
  expect(logPath('/home/u/', 'abc')).toBe('/home/u/.claude/cockpit-log/abc.jsonl')
  expect(logPath('C:\\Users\\f', '../../x')).not.toContain('..')
})

test('rows pile up, keeping the newest', () => {
  let text = ''
  for (let i = 0; i < MAX_LINES + 5; i++) text = withRow(text, String(i))
  const lines = text.trim().split('\n')
  expect(lines.length).toBe(MAX_LINES)
  expect(lines[lines.length - 1]).toBe(String(MAX_LINES + 4))
})
