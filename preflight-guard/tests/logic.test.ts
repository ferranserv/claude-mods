import { expect, test } from 'claude-code/testing'

import { MINUTE, advise, isDefaultBranch, isSecretPath, parseStatus, peerKind, pickFiles, relativeTo, slugOf } from '../hooks/logic'
import type { Facts, Peer } from '../hooks/logic'

const NOW = 10_000_000_000
const peer = (o: Partial<Peer>): Peer => ({ id: 'abc123', cwd: '/r/.claude/worktrees/a', branch: 'claude/a', phase: 'idle', at: NOW - MINUTE, files: [], ...o })
const facts = (o: Partial<Facts>): Facts => ({ now: NOW, cwd: '/r', branch: 'claude/x', originHead: 'main', isBusy: false, changes: [], mine: null, peers: [], peerChanges: {}, isFirstTurn: true, ...o })
const ch = (...paths: string[]) => paths.map(path => ({ path, code: ' M' }))
const kinds = (f: Facts) => advise(f).map(a => a.kind)

test('a clean feature branch with nobody else around says nothing', () => {
  expect(kinds(facts({}))).toEqual([])
})

test('main, master and the remote default count as the shared branch', () => {
  expect(isDefaultBranch('main', '')).toBe(true)
  expect(isDefaultBranch('master', '')).toBe(true)
  expect(isDefaultBranch('release', 'release')).toBe(true)
  expect(isDefaultBranch('claude/x', 'main')).toBe(false)
  expect(isDefaultBranch('', 'main')).toBe(false)
})

test('main with changes: warns about main and offers a checkpoint on a new branch', () => {
  const a = advise(facts({ branch: 'main', changes: ch('a.ts') }))
  expect(a.map(x => x.kind)).toEqual(['main', 'dirty'])
  expect(a[1]).toMatchObject({ onDefault: true, count: 1 })
})

test('another live session in this very folder: collision warning, and its changes are not offered as mine', () => {
  const f = facts({ changes: ch('a.ts'), peers: [peer({ cwd: '/r', phase: 'working' })] })
  expect(kinds(f)).toEqual(['shared-folder'])
})

test('folder paths compare across slash style and case (Windows)', () => {
  const f = facts({ cwd: 'C:\\Users\\f\\repo', peers: [peer({ cwd: 'c:/users/f/repo/' })] })
  expect(kinds(f)).toEqual(['shared-folder'])
})

test('a peer in another folder that is still working is never offered for commit', () => {
  const f = facts({ peers: [peer({ phase: 'working' })], peerChanges: { abc123: ch('a.ts') } })
  expect(kinds(f)).toEqual(['peer-working'])
})

test('a peer that finished its turn and left changes is offered, counting what it takes and leaves', () => {
  const f = facts({ peers: [peer({})], peerChanges: { abc123: ch('a.ts', 'b.ts', '.env') } })
  const a = advise(f)
  expect(a).toHaveLength(1)
  expect(a[0]).toMatchObject({ kind: 'peer-done', take: 2, secrets: 1, leave: 0, isSole: true })
})

test('a peer with nothing uncommitted is not mentioned', () => {
  expect(kinds(facts({ peers: [peer({})], peerChanges: { abc123: [] } }))).toEqual([])
})

test('two peers sharing one folder: each may take only the files it wrote', () => {
  const peers = [peer({ id: 'p1', files: ['a.ts'] }), peer({ id: 'p2', files: ['b.ts'] })]
  const f = facts({ peers, peerChanges: { p1: ch('a.ts', 'b.ts', 'c.ts'), p2: ch('a.ts', 'b.ts', 'c.ts') } })
  const a = advise(f)
  expect(a.map(x => (x as { take: number }).take)).toEqual([1, 1])
  expect(a[0]).toMatchObject({ leave: 2, isSole: false })
})

test('a silent "working" peer may have closed: offered only if it provably wrote files', () => {
  const gone = peer({ phase: 'working', at: NOW - 30 * MINUTE })
  expect(peerKind(gone, NOW)).toBe('maybe-gone')
  expect(kinds(facts({ peers: [gone], peerChanges: { abc123: ch('a.ts') } }))).toEqual([])
  const wrote = peer({ phase: 'working', at: NOW - 30 * MINUTE, files: ['a.ts'] })
  expect(kinds(facts({ peers: [wrote], peerChanges: { abc123: ch('a.ts') } }))).toEqual(['peer-done'])
})

test('ended and day-old sessions are ignored', () => {
  expect(peerKind(peer({ phase: 'ended' }), NOW)).toBe('ignore')
  expect(peerKind(peer({ at: NOW - 25 * 60 * MINUTE }), NOW)).toBe('ignore')
})

test('secret-looking files are never taken', () => {
  for (const p of ['.env', 'cfg/.env.local', 'k.pem', 'id_rsa', 'a/credentials.json', 'x.sqlite']) expect(isSecretPath(p)).toBe(true)
  for (const p of ['src/env.ts', 'README.md', 'keyboard.ts']) expect(isSecretPath(p)).toBe(false)
  expect(pickFiles(ch('a.ts', '.env'), [], true)).toEqual({ take: ['a.ts'], leave: [], secrets: ['.env'] })
})

test('git status -z is parsed, renames included', () => {
  expect(parseStatus(' M a.ts\0?? b.ts\0R  new.ts\0old.ts\0')).toEqual([
    { code: ' M', path: 'a.ts' },
    { code: '??', path: 'b.ts' },
    { code: 'R ', path: 'new.ts' },
  ])
})

test('tool paths become repo-relative; outside the repo they are dropped', () => {
  expect(relativeTo('/r', '/r/src/a.ts')).toBe('src/a.ts')
  expect(relativeTo('C:\\r', 'c:\\r\\src\\a.ts')).toBe('src/a.ts')
  expect(relativeTo('/r', '/elsewhere/a.ts')).toBeNull()
  expect(relativeTo('/r', 'src/a.ts')).toBe('src/a.ts')
})

test('worktree names are short, unique per minute and path-safe', () => {
  expect(slugOf('3f9a-bb21-xx', new Date(2026, 9, 19, 14, 5).getTime())).toBe('s-3f9abb-1019-1405')
})
