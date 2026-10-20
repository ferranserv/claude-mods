import { expect, mock, test } from 'claude-code/testing'

const NOW = new Date(2026, 9, 19, 12).getTime()
const props = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} }
const started = ($: unknown) => ($ as { session: { start: (i: unknown) => Promise<unknown> } }).session.start({ cwd: '/r', surface: 'desktop', isInteractive: true })

type World = { branch: string; mine: string; peers: Record<string, unknown>; dirty: Record<string, string[]> }

// A fake git and a fake registry folder: enough to drive every button.
function setup(on: Parameters<typeof mock.clock>[0], w: World) {
  const clock = mock.clock(on, { now: NOW })
  const log = { git: [] as string[][], writes: {} as Record<string, string>, store: {} as Record<string, unknown> }
  on('session.start', () => ({ cwd: '/r' }) as never)
  on('session.cwd', () => ({ value: '/r' }) as never)
  on('session.id', () => ({ value: w.mine }) as never)
  on('command.register', () => ({ value: { command: 'preflight' } }) as never)
  on('store.get', (_, e) => ({ value: log.store[e.key] }) as never)
  on('store.set', (_, e) => {
    log.store[e.key] = e.value
    return { value: undefined } as never
  })
  on('fs.exists', () => ({ value: false }) as never)
  on('fs.list', () => ({ value: Object.keys(w.peers).map(id => ({ name: `${id}.json`, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
  on('fs.read', (_, e) => ({ value: JSON.stringify(w.peers[String((e as { path: string }).path.split('/').pop()?.replace('.json', ''))]) }) as never)
  on('fs.write', (_, e) => {
    log.writes[(e as { path: string }).path] = (e as { text: string }).text
    return { value: undefined } as never
  })
  on('process.run', (_, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    log.git.push(argv)
    const cwd = argv[2] ?? ''
    const sub = argv[3] ?? ''
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as never
    if (sub === 'rev-parse' && argv.includes('--show-toplevel')) return out('/r\n')
    if (sub === 'rev-parse' && argv.includes('--git-common-dir')) return out('/r/.git\n')
    if (sub === 'rev-parse' && argv.includes('--abbrev-ref')) return out(`${w.branch}\n`)
    if (sub === 'rev-parse') return out('/r/.git\n')
    if (sub === 'symbolic-ref') return out('origin/main\n')
    if (sub === 'diff') return out('5\t2\ta.ts\n')
    if (sub === 'status') return out((w.dirty[cwd] ?? []).map(p => ` M ${p}\0`).join(''))
    return out('')
  })
  return { clock, log }
}

const peer = (o: Record<string, unknown>) => ({ id: 'p1abcdef', cwd: '/r/.claude/worktrees/a', branch: 'claude/a', phase: 'idle', at: NOW - 60_000, files: [], ...o })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function band($: { ui: { mount: (i: never) => Promise<any> } }) {
  return $.ui.mount({ plugin: 'cockpit', surface: 'desktop', component: 'AbovePrompt', props } as never)
}

test('on main with changes the band warns and the checkpoint goes to a new branch, never to main', async ($, on) => {
  const { clock, log } = setup(on, { branch: 'main', mine: 'me000000', peers: {}, dirty: { '/r': ['a.ts', '.env'] } })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  await clock.advance(2000)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /You are on main/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 files changed/ })).toBeDefined()
  await ui.press({ key: 'cp' } as never)
  const cmds = log.git.map(a => a.slice(3).join(' '))
  expect(cmds.some(c => c.startsWith('switch -c checkpoint/'))).toBe(true)
  expect(cmds.some(c => c.startsWith('add -A -- a.ts') && !c.includes('.env'))).toBe(true)
  expect(cmds.some(c => c.startsWith('commit -m') && c.endsWith('-- a.ts'))).toBe(true)
  expect(cmds.some(c => c.startsWith('push'))).toBe(false)
  await ui.unmount()
})

test('a finished session: first click only asks, the second commits only its files, nothing is pushed', async ($, on) => {
  const w: World = { branch: 'claude/x', mine: 'me000000', peers: { p1abcdef: peer({ files: ['a.ts'] }) }, dirty: { '/r/.claude/worktrees/a': ['a.ts', '.env'] } }
  const { clock, log } = setup(on, w)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  await clock.advance(2000)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /Session p1abcd finished: 1 file \(\+5 −2\)/ })).toBeDefined()
  await ui.press({ key: 'ask' } as never)
  expect(log.git.some(a => a.includes('commit'))).toBe(false)
  await ui.press({ key: 'yes' } as never)
  const commit = log.git.find(a => a.includes('commit'))
  expect(commit?.[2]).toBe('/r/.claude/worktrees/a')
  expect(commit?.at(-1)).toBe('a.ts')
  expect(commit?.join(' ')).not.toContain('.env')
  expect(log.git.some(a => a.includes('push'))).toBe(false)
  await ui.unmount()
})

test('a session still working offers no commit button', async ($, on) => {
  const w: World = { branch: 'claude/x', mine: 'me000000', peers: { p1abcdef: peer({ phase: 'working' }) }, dirty: { '/r/.claude/worktrees/a': ['a.ts'] } }
  const { clock } = setup(on, w)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  await clock.advance(2000)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /Session p1abcd is working/ })).toBeDefined()
  expect(await ui.find({ key: 'ask' } as never)).toBeUndefined()
  await ui.unmount()
})

test('another session in the same folder: New worktree is offered and creates a branch under .claude/worktrees', async ($, on) => {
  const w: World = { branch: 'claude/x', mine: 'me000000', peers: { p1abcdef: peer({ cwd: '/r', phase: 'working' }) }, dirty: {} }
  const { clock, log } = setup(on, w)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  await clock.advance(2000)
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /Another session is in this folder/ })).toBeDefined()
  await ui.press({ key: 'wt-shared-folder' } as never)
  const add = log.git.find(a => a.includes('worktree'))
  expect(add?.join(' ')).toMatch(/worktree add -b claude\/s-me0000-\d{4}-\d{4} \/r\/\.claude\/worktrees\/s-me0000-/)
  await ui.unmount()
})

test('this session writes a heartbeat that says what it touched, and "ended" when it closes', async ($, on) => {
  const { clock, log } = setup(on, { branch: 'claude/x', mine: 'me000000', peers: {}, dirty: {} })
  on('turn.start', () => ({}) as never)
  on('tool.call', () => ({ result: {} }) as never)
  on('session.end', () => ({ sessionId: 'me000000' }) as never)
  await started($)
  await clock.advance(2000)
  await $.tool.call({ tool: 'Edit', file_path: '/r/src/a.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.advance(10)
  const file = log.writes['/r/.git/preflight-guard/me000000.json']
  expect(JSON.parse(file ?? '{}')).toMatchObject({ id: 'me000000', phase: 'working', files: ['src/a.ts'] })
  await ($ as unknown as { session: { end: (i: unknown) => Promise<unknown> } }).session.end({ reason: 'other' })
  expect(JSON.parse(log.writes['/r/.git/preflight-guard/me000000.json'] ?? '{}').phase).toBe('ended')
})

test('/preflight off silences it', async ($, on) => {
  const { clock } = setup(on, { branch: 'main', mine: 'me000000', peers: {}, dirty: {} })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  await started($)
  await clock.advance(2000)
  const r = (await $.command.run({ command: 'preflight', args: 'off' } as never)) as { text: string }
  expect(r.text).toContain('off')
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: /You are on main/ })).toBeUndefined()
  await ui.unmount()
})
