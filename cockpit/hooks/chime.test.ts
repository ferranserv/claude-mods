import { expect, test } from 'claude-code/testing'

import { world } from './world'

const finish = ($: unknown, reason = 'answer') =>
  ($ as { turn: { complete: (i: unknown) => Promise<unknown> } }).turn.complete({ reason, answer: 'x', durationMs: 5, isAborted: reason === 'aborted', turnId: 't' })

test('the chime plays on every finished turn, and on Windows also through PowerShell', async ($, on) => {
  let os = 'Windows_NT'
  world(on, { env: { get OS() { return os } } as never, bare: true })
  const played: unknown[] = []
  const ran: string[][] = []
  on('audio.play', (_, e) => {
    played.push(e)
    return { value: undefined } as never
  })
  on('process.run', (_, e) => {
    ran.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)

  await finish($)
  expect(played.length).toBe(1)
  expect(ran[0]?.[0]).toBe('powershell.exe')
  expect(ran[0]?.at(-1)).toContain('done.wav')

  os = 'Darwin'
  await finish($)
  expect(played.length).toBe(2)
  expect(ran.length).toBe(1)

  await finish($, 'aborted')
  expect(played.length).toBe(2)
})
