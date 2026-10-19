import { expect, mock, test } from 'claude-code/testing'

import { headOf, join, repoOf } from '../hooks/paths'

test('the repo folder is the parent of the plugin folder, on any slash style', async () => {
  expect(repoOf('C:\\Users\\f\\mods\\mods-manager')).toBe('C:\\Users\\f\\mods')
  expect(repoOf('/home/f/mods/mods-manager/')).toBe('/home/f/mods')
  expect(repoOf('mods-manager')).toBe('')
  expect(join('C:\\Users\\f\\mods', '.git')).toBe('C:\\Users\\f\\mods/.git')
  expect(headOf('abc123\n')).toBe('abc123')
  expect(headOf('')).toBe('')
})

type Heads = { before: string; after: string; pullOk?: boolean; hasGit?: boolean; canRun?: boolean }

function setup(on: Parameters<typeof mock.clock>[0], h: Heads) {
  const clock = mock.clock(on, { now: 10_000_000 })
  const log = { runs: [] as string[][], toasts: [] as string[], store: {} as Record<string, unknown> }
  let revs = 0
  on('store.get', (_, e) => ({ value: log.store[e.key] }) as never)
  on('store.set', (_, e) => {
    log.store[e.key] = e.value
    return { value: undefined } as never
  })
  on('fs.exists', () => ({ value: h.hasGit ?? true }) as never)
  on('ui.toast', (_, e) => {
    log.toasts.push(String((e as { text?: string }).text))
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: { command: 'updatemods' } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('process.run', (_, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    log.runs.push(argv)
    if (h.canRun === false) return { deny: 'no commands here' } as never
    const isPull = argv.includes('pull')
    const out = argv.includes('rev-parse') ? `${revs++ === 0 ? h.before : h.after}\n` : ''
    return { value: { exitCode: isPull && h.pullOk === false ? 1 : 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  return { clock, log }
}

const start = ($: unknown) => ($ as { session: { start: (i: unknown) => Promise<unknown> } }).session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

test('session start pulls once the session is up, and says so when the files changed', async ($, on) => {
  const { clock, log } = setup(on, { before: 'aaaaaaa1', after: 'bbbbbbb2' })
  await start($)
  expect(log.runs.length).toBe(0) // not before the session is up
  await clock.advance(3500)
  expect(log.runs.some(r => r.includes('pull') && r.includes('--ff-only'))).toBe(true)
  expect(log.toasts.at(-1)).toContain('Mods updated to bbbbbbb')
  expect(log.toasts.at(-1)).toContain('new session')
})

test('nothing to say when already up to date', async ($, on) => {
  const { clock, log } = setup(on, { before: 'same', after: 'same' })
  await start($)
  await clock.advance(3500)
  expect(log.toasts).toEqual([])
})

test('the automatic pull runs at most once an hour; /updatemods ignores that', async ($, on) => {
  const { clock, log } = setup(on, { before: 'a', after: 'b' })
  await start($)
  await clock.advance(3500)
  const pulls = () => log.runs.filter(r => r.includes('pull')).length
  expect(pulls()).toBe(1)
  await start($)
  await clock.advance(3500)
  expect(pulls()).toBe(1)
  const r = await $.command.run({ command: 'updatemods', args: '' } as never)
  expect(pulls()).toBe(2)
  expect(String((r as { text: string }).text)).toBeDefined()
})

test('where commands cannot run: one notice, ever, and the session is untouched', async ($, on) => {
  const { clock, log } = setup(on, { before: 'a', after: 'a', canRun: false })
  await start($)
  await clock.advance(3500)
  expect(log.toasts.length).toBe(1)
  expect(log.toasts[0]).toContain('cannot run git')
  await start($)
  await clock.advance(3500 + 3_600_000)
  expect(log.toasts.length).toBe(1)
})

test('a folder that is not a git clone is left alone', async ($, on) => {
  const { clock, log } = setup(on, { before: 'a', after: 'b', hasGit: false })
  await start($)
  await clock.advance(3500)
  expect(log.runs).toEqual([])
  const r = await $.command.run({ command: 'updatemods', args: '' } as never)
  expect(String((r as { text: string }).text)).toContain('Not a git folder')
})

test('a failed pull (offline, diverged) changes nothing and says so on demand', async ($, on) => {
  const { clock, log } = setup(on, { before: 'a', after: 'b', pullOk: false })
  await start($)
  await clock.advance(3500)
  expect(log.toasts).toEqual([])
  const r = await $.command.run({ command: 'updatemods', args: '' } as never)
  expect(String((r as { text: string }).text)).toContain('did not finish')
})
