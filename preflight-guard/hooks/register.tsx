import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Notice } from '../types'
import { stack } from './bands'
import {
  WRITE_TOOLS,
  advise,
  checkpointMessage,
  norm,
  parseNumstat,
  parseStatus,
  peerCommitMessage,
  peerKind,
  pickFiles,
  relativeTo,
  sameDir,
  short,
  slugOf,
  worktreePath,
} from './logic'
import type { Advice, Change, Facts, Peer, Phase, Stat } from './logic'

const isOn = atom({ plugin: 'preflight-guard', key: 'isOn' } as const, true)
const advice = atom({ plugin: 'preflight-guard', key: 'advice' } as const, [] as Advice[])
const isDismissed = atom({ plugin: 'preflight-guard', key: 'isDismissed' } as const, false)
const pending = atom({ plugin: 'preflight-guard', key: 'pending' } as const, null as string | null)
const notice = atom({ plugin: 'preflight-guard', key: 'notice' } as const, null as Notice | null)

// Rank 5: above every other band, so a warning is never pushed below the meters. A literal key rather than
// an entry in RANK, so the shared bands.tsx stays identical in all five band mods.
const KEY = 'band:5:preflight-guard'
const COLOR = { warn: '#d97706', ok: '#16a34a', dim: '#8b949e', text: '#c9d1d9' }

type Run = { ok: boolean; out: string; err: string }

// Every git call goes through here: best effort, never throws (the desktop app may not allow commands).
async function git($: EngineInterface, cwd: string, args: string[]): Promise<Run> {
  try {
    const r = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 30_000 })
    return { ok: r.exitCode === 0, out: r.stdout, err: r.stderr }
  } catch {
    return { ok: false, out: '', err: 'cannot run git here' }
  }
}

async function parsePeer($: EngineInterface, path: string): Promise<Peer | null> {
  try {
    const raw = (await $.fs.read(path)) as unknown
    const text = typeof raw === 'string' ? raw : String((raw as { text?: string }).text ?? '')
    const p = JSON.parse(text) as Peer
    return typeof p.id === 'string' && typeof p.cwd === 'string' && typeof p.at === 'number' ? p : null
  } catch {
    return null
  }
}

type Repo = { cwd: string; root: string; common: string; branch: string }

async function repoOf($: EngineInterface): Promise<Repo | null> {
  const cwd = await $.session.cwd()
  const root = await git($, cwd, ['rev-parse', '--show-toplevel'])
  if (!root.ok) return null
  let common = await git($, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!common.ok) common = await git($, cwd, ['rev-parse', '--git-common-dir'])
  const branch = await git($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!common.ok || !branch.ok) return null
  let dir = norm(common.out.trim())
  if (!/^([a-z]:)?\//i.test(dir)) dir = `${norm(root.out.trim())}/${dir}`
  return { cwd: norm(cwd), root: norm(root.out.trim()), common: dir, branch: branch.out.trim() }
}

const registryDir = (repo: Repo) => `${repo.common}/preflight-guard`

async function peersOf($: EngineInterface, repo: Repo, selfId: string): Promise<Peer[]> {
  try {
    const entries = await $.fs.list(registryDir(repo))
    const all = await Promise.all(entries.filter(f => f.name.endsWith('.json')).map(f => parsePeer($, `${registryDir(repo)}/${f.name}`)))
    return all.filter((p): p is Peer => p !== null && p.id !== selfId)
  } catch {
    return []
  }
}

async function gather($: EngineInterface, selfId: string, mine: Peer | null): Promise<Facts | null> {
  const repo = await repoOf($)
  if (!repo) return null
  const now = await $.clock.now()
  const head = await git($, repo.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const status = await git($, repo.cwd, ['status', '--porcelain=v1', '-z'])
  const gitDir = await git($, repo.cwd, ['rev-parse', '--absolute-git-dir'])
  let isBusy = repo.branch === 'HEAD'
  if (gitDir.ok) {
    for (const m of ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD']) {
      if (await $.fs.exists(`${norm(gitDir.out.trim())}/${m}`)) isBusy = true
    }
  }
  const peers = await peersOf($, repo, selfId)
  const numstat = async (dir: string) => {
    const d = await git($, dir, ['diff', 'HEAD', '--numstat'])
    return d.ok ? parseNumstat(d.out) : {}
  }
  const stats: Record<string, Record<string, Stat>> = { '': await numstat(repo.cwd) }
  const peerChanges: Record<string, Change[]> = {}
  for (const p of peers) {
    if (peerKind(p, now) === 'ignore' || sameDir(p.cwd, repo.cwd)) continue
    const s = await git($, p.cwd, ['status', '--porcelain=v1', '-z'])
    peerChanges[p.id] = s.ok ? parseStatus(s.out) : []
    if (peerChanges[p.id]?.length) stats[p.id] = await numstat(p.cwd)
  }
  return {
    now,
    cwd: repo.cwd,
    branch: repo.branch,
    originHead: head.ok ? head.out.trim().replace(/^origin\//, '') : '',
    isBusy,
    changes: status.ok ? parseStatus(status.out) : [],
    mine,
    peers,
    peerChanges,
    stats,
    isFirstTurn: true,
  }
}

async function say($: EngineInterface, text: string, isError = false): Promise<void> {
  await update($, notice, () => ({ text, isError }))
  await update($, pending, () => null)
}

// ---- actions (each is one click; none pushes) ----

async function newWorktree($: EngineInterface, selfId: string): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder, so no worktree.', true)
  const slug = slugOf(selfId, await $.clock.now())
  const path = worktreePath(repo.root, slug)
  const made = await git($, repo.root, ['worktree', 'add', '-b', `claude/${slug}`, path, 'HEAD'])
  if (!made.ok) return say($, `Could not create the worktree: ${made.err.trim().split('\n')[0] ?? 'git refused'}`, true)
  // Keep the worktrees folder out of `git status` in the main folder.
  const exclude = `${repo.common}/info/exclude`
  try {
    const raw = (await $.fs.exists(exclude)) ? ((await $.fs.read(exclude)) as unknown) : ''
    const text = typeof raw === 'string' ? raw : String((raw as { text?: string }).text ?? '')
    if (!text.includes('.claude/worktrees/')) await $.fs.write(exclude, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}.claude/worktrees/\n`)
  } catch {
    // Cosmetic: the folder then shows as untracked in the main checkout.
  }
  await $.store.set('lastWorktree', path)
  await say($, `Worktree ready: claude/${slug}`)
}

async function switchInto($: EngineInterface): Promise<void> {
  const path = String((await $.store.get('lastWorktree')) ?? '')
  if (path === '') return say($, 'No worktree made yet.', true)
  await say($, 'Asking Claude to switch into the worktree (one short turn).')
  void $.prompt.submit({ text: `Call EnterWorktree with path "${path}" to switch this session into the existing worktree. Do nothing else.` })
}

async function checkpoint($: EngineInterface, onDefault: boolean): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder.', true)
  const status = await git($, repo.cwd, ['status', '--porcelain=v1', '-z'])
  const pk = pickFiles(parseStatus(status.out), [], true)
  if (pk.take.length === 0) return say($, 'Nothing to checkpoint (secrets are never taken).')
  let branch = repo.branch
  // On main: a new branch carries the uncommitted files with it and loses nothing.
  if (onDefault) {
    branch = `checkpoint/${slugOf(repo.cwd, await $.clock.now())}`
    const sw = await git($, repo.cwd, ['switch', '-c', branch])
    if (!sw.ok) return say($, `Could not open a branch: ${sw.err.trim().split('\n')[0] ?? 'git refused'}`, true)
  }
  const add = await git($, repo.cwd, ['add', '-A', '--', ...pk.take])
  if (!add.ok) return say($, `git add failed: ${add.err.trim().split('\n')[0] ?? ''}`, true)
  const c = await git($, repo.cwd, ['commit', '-m', checkpointMessage(pk.take.length, branch), '--', ...pk.take])
  if (!c.ok) return say($, `Commit failed: ${(c.err || c.out).trim().split('\n')[0] ?? ''}`, true)
  const skipped = pk.secrets.length > 0 ? ` ${pk.secrets.length} secret left alone.` : ''
  await say($, `Committed ${pk.take.length} files on ${branch}, not pushed.${skipped} Undo: git reset --soft HEAD~1`)
}

async function commitPeer($: EngineInterface, peerId: string): Promise<void> {
  const repo = await repoOf($)
  if (!repo) return say($, 'Not a git folder.', true)
  const peer = (await peersOf($, repo, '')).find(p => p.id === peerId)
  if (!peer) return say($, 'That session is gone.', true)
  // Re-check at click time: it may have started a new turn since the band was drawn.
  const now = await $.clock.now()
  if (peerKind(peer, now) === 'working') return say($, `Session ${short(peerId)} started working again. Wait for it to finish.`, true)
  const live = (await peersOf($, repo, '')).filter(p => peerKind(p, now) !== 'ignore' && sameDir(p.cwd, peer.cwd))
  const status = await git($, peer.cwd, ['status', '--porcelain=v1', '-z'])
  const pk = pickFiles(parseStatus(status.out), peer.files, live.length <= 1)
  if (pk.take.length === 0) return say($, 'Nothing of that session left to commit.')
  const add = await git($, peer.cwd, ['add', '-A', '--', ...pk.take])
  if (!add.ok) return say($, `git add failed: ${add.err.trim().split('\n')[0] ?? ''}`, true)
  const c = await git($, peer.cwd, ['commit', '-m', peerCommitMessage(pk.take.length, peerId, peer.branch), '--', ...pk.take])
  if (!c.ok) return say($, `Commit failed: ${(c.err || c.out).trim().split('\n')[0] ?? ''}`, true)
  const rest = pk.leave.length + pk.secrets.length
  await say($, `Committed ${pk.take.length} files on ${peer.branch}, not pushed.${rest > 0 ? ` ${rest} left alone.` : ''} Undo: git -C "${peer.cwd}" reset --soft HEAD~1`)
}

// ---- the band ----

const counts = (a: { add: number; del: number }) => (a.add + a.del > 0 ? ` (+${a.add} −${a.del})` : '')
const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`

// Short on purpose: the whole band is one line.
const label = (a: Advice): string => {
  switch (a.kind) {
    case 'shared-folder':
      return 'Another session is in this folder'
    case 'main':
      return `You are on ${a.branch}`
    case 'dirty':
      return `${files(a.count)} changed${counts(a)}`
    case 'peer-working':
      return `Session ${short(a.peerId)} is working`
    case 'peer-done':
      return `Session ${short(a.peerId)} finished: ${files(a.take)}${counts(a)}${a.secrets > 0 ? `, ${a.secrets} secret skipped` : ''}`
  }
}

const S = { selfId: '', mine: null as Peer | null, lastWrite: 0, lastSig: '' }

// The heartbeat other sessions read. Overwritten, never deleted (no delete call): an ended session says so.
async function beat($: EngineInterface, phase: Phase, files: string[] = []): Promise<void> {
  try {
    const repo = await repoOf($)
    if (!repo) return
    const now = await $.clock.now()
    const known = new Set(S.mine?.files ?? [])
    for (const f of files) known.add(f)
    S.mine = { id: S.selfId, cwd: repo.cwd, branch: repo.branch, phase, at: now, files: [...known].slice(-300) }
    S.lastWrite = now
    await $.fs.write(`${registryDir(repo)}/${S.selfId}.json`, JSON.stringify(S.mine))
  } catch {
    // Without a heartbeat the other sessions simply do not see this one.
  }
}

async function refresh($: EngineInterface): Promise<void> {
  if (!(await read($, isOn))) return update($, advice, () => []).then(() => undefined)
  const facts = await gather($, S.selfId, S.mine)
  const list = facts ? advise(facts) : []
  const sig = JSON.stringify(list.map(a => a.kind + ('peerId' in a ? a.peerId : '')))
  if (sig !== S.lastSig) {
    S.lastSig = sig
    await update($, isDismissed, () => false)
  }
  await update($, advice, () => list)
}

const act = ($: EngineInterface, fn: () => Promise<void>) => async () => {
  await fn()
  await refresh($)
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    S.selfId = await $.session.id()
    try {
      await $.command.register({ name: 'preflight', description: 'Check main, uncommitted changes and other sessions: /preflight, /preflight off|on', argumentHint: 'off|on' })
    } catch {
      // Name taken: the band still works.
    }
    const stored = await $.store.get('isOn')
    if (typeof stored === 'boolean') await update($, isOn, () => stored)
    // After the session is up, so git never delays the start.
    $.clock.after(1500, () => void beat($, 'idle').then(() => refresh($)))
    $.clock.every(30_000, () => void refresh($))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'preflight' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, isOn, () => arg === 'on')
      await $.store.set('isOn', arg === 'on')
      await refresh($)
      return { text: `Preflight Guard ${arg}.` }
    }
    await update($, isDismissed, () => false)
    await refresh($)
    const list = await read($, advice)
    return { text: list.length === 0 ? 'All clear: not on main, nothing uncommitted, no other session in the way.' : list.map(label).join('\n') }
  })

  on('turn.start', async ($, e, next) => {
    void beat($, 'working')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { tool?: string; file_path?: string; notebook_path?: string }
    const tool = String(input.tool ?? '')
    if ((WRITE_TOOLS as readonly string[]).includes(tool)) {
      const file = String(input.file_path ?? input.notebook_path ?? '')
      void (async () => {
        const repo = await repoOf($)
        const rel = repo && file !== '' ? relativeTo(repo.root, file) : null
        await beat($, 'working', rel ? [rel] : [])
      })()
    } else if ((await $.clock.now()) - S.lastWrite > 30_000) {
      void beat($, 'working')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await beat($, 'idle')
    void refresh($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await beat($, 'ended')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || e.props.isWorking) return below
    const list = await read($, advice)
    const note = await read($, notice)
    if (!note && (list.length === 0 || (await read($, isDismissed)))) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const ask = await read($, pending)
    const items: RenderChildren[] = []
    const sep = (k: string) => <Text key={`sep-${k}`} color={COLOR.dim}>{'  ·  '}</Text>

    if (note) {
      items.push(<Text key="note" color={note.isError ? COLOR.warn : COLOR.ok}>{note.isError ? '! ' : '✓ '}{note.text}</Text>)
      if (note.text.startsWith('Worktree ready')) {
        items.push(<Button key="sw" label="Switch" onPress={() => void switchInto($)} />)
        items.push(<Button key="copy" label="Copy path" onPress={() => void $.store.get('lastWorktree').then(p => $.ui.copy({ text: String(p ?? ''), surface: e.surface }))} />)
      }
      items.push(<Button key="ok" label="OK" onPress={() => void update($, notice, () => null)} />)
    } else {
      list.forEach((a, i) => {
        const warn = a.kind !== 'peer-working'
        const id = `${a.kind}-${'peerId' in a ? a.peerId : ''}`
        if (i > 0) items.push(sep(id))
        const asking = a.kind === 'peer-done' && ask === a.peerId
        items.push(
          <Text key={id} color={warn ? COLOR.warn : COLOR.dim}>
            {asking ? `Commit ${files(a.take)} on ${a.branch}? Not pushed.` : label(a)}
          </Text>,
        )
        if (a.kind === 'shared-folder' || a.kind === 'main') {
          items.push(<Button key={`wt-${a.kind}`} label="New worktree" onPress={act($, () => newWorktree($, S.selfId))} />)
        }
        if (a.kind === 'dirty') {
          items.push(<Button key="cp" label={a.onDefault ? 'Commit to new branch' : 'Commit checkpoint'} onPress={act($, () => checkpoint($, a.onDefault))} />)
        }
        if (a.kind === 'peer-done' && a.take > 0) {
          if (asking) {
            items.push(<Button key="yes" label="Yes, commit" onPress={act($, () => commitPeer($, a.peerId))} />)
            items.push(<Button key="no" label="No" onPress={() => void update($, pending, () => null)} />)
          } else {
            items.push(<Button key="ask" label="Commit its files" onPress={() => void update($, pending, () => a.peerId)} />)
          }
        }
      })
      items.push(sep('end'))
      items.push(<Button key="hide" label="Hide" onPress={() => void update($, isDismissed, () => true)} />)
    }

    // One line, a blank line below so the next band does not touch it.
    const mineBand = (
      <Box key={KEY} flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
        <Text color={COLOR.warn}>●</Text>
        {items}
      </Box>
    )
    return stack(below, mineBand as never, Box)
  })
}
