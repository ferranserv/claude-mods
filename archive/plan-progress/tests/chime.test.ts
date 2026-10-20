import { expect, mock, test } from 'claude-code/testing'

const finish = ($: unknown) =>
  ($ as { turn: { complete: (i: unknown) => Promise<unknown> } }).turn.complete({ reason: 'answer', answer: 'x', durationMs: 5, isAborted: false, turnId: 't' })

test('the chime plays on every finished turn, and on Windows also through PowerShell', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  const played: unknown[] = []
  const ran: string[][] = []
  let os = 'Windows_NT'
  on('audio.play', (_, e) => {
    played.push(e)
    return { value: undefined } as never
  })
  on('env.get', () => ({ value: os }) as never)
  on('process.run', (_, e) => {
    ran.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)

  await finish($)
  expect(played.length).toBe(1)
  expect(ran.length).toBe(1)
  expect(ran[0]?.[0]).toBe('powershell.exe')
  expect(ran[0]?.at(-1)).toContain('done.wav')

  os = 'Darwin'
  await finish($)
  expect(played.length).toBe(2)
  expect(ran.length).toBe(1)
})

test('an interrupted turn is silent', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  let played = 0
  on('audio.play', () => {
    played += 1
    return { value: undefined } as never
  })
  on('env.get', () => ({ value: 'Windows_NT' }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  await ($ as { turn: { complete: (i: unknown) => Promise<unknown> } }).turn.complete({ reason: 'aborted', answer: '', durationMs: 5, isAborted: true, turnId: 't' })
  expect(played).toBe(0)
})
