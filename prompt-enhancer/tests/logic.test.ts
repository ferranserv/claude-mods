import { expect, test } from 'claude-code/testing'

import { buildPrompt, cleanOutput, matchesChord, parseChord, pickSkills } from '../hooks/logic'

test('chords parse and match; bare letters and junk are off', async () => {
  const c = parseChord('meta+e')
  expect(c).toEqual({ key: 'e', ctrl: false, meta: true, shift: false })
  expect(matchesChord(c, { key: 'e', meta: true })).toBe(true)
  expect(matchesChord(c, { key: 'E', meta: true })).toBe(true)
  expect(matchesChord(c, { key: 'e' })).toBe(false)
  expect(matchesChord(c, { key: 'e', meta: true, shift: true })).toBe(false)
  expect(parseChord('alt+e')?.meta).toBe(true)
  expect(parseChord('ctrl+shift+k')).toEqual({ key: 'k', ctrl: true, meta: false, shift: true })
  expect(parseChord('e')).toBeUndefined()
  expect(parseChord('')).toBeUndefined()
  expect(parseChord('ctrl+')).toBeUndefined()
  expect(matchesChord(undefined, { key: 'e', meta: true })).toBe(false)
})

test('skills: best word matches first, deduped, capped; pads when little matches', async () => {
  const all = [
    { name: 'xlsx', description: 'Spreadsheet files, pivot tables and charts' },
    { name: 'pdf', description: 'Read, merge and split PDF files' },
    { name: 'kpi-dashboard-design', description: 'Design KPI dashboards with metrics' },
    { name: 'pdf', description: 'duplicate' },
  ]
  const top = pickSkills('build a KPI dashboard from the spreadsheet', all, 2)
  expect(top.map(s => s.name)).toEqual(['kpi-dashboard-design', 'xlsx'])
  const padded = pickSkills('zzz qqq', all, 10)
  expect(padded.length).toBe(3)
})

test('prompt wraps draft, skills and project; output fences are stripped', async () => {
  const p = buildPrompt('fix the login bug', [{ name: 'debug', description: 'Structured\n debugging' }], '## git status\nmain')
  expect(p).toContain('<draft>\nfix the login bug\n</draft>')
  expect(p).toContain('- /debug: Structured debugging')
  expect(p).toContain('## git status')
  expect(buildPrompt('x', [], '')).toContain('(none installed)')
  expect(cleanOutput('```\nhello\n```')).toBe('hello')
  expect(cleanOutput('  plain  ')).toBe('plain')
})
