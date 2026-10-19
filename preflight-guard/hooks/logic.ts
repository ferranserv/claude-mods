// Pure rules of Preflight Guard: no engine calls, so every rule is tested without git.

export const MINUTE = 60_000
/** A session that said "working" and has been silent this long may have closed. */
export const WORKING_FRESH_MS = 15 * MINUTE
/** A heartbeat file older than this is ignored (a crash leaves files behind and nothing can delete them). */
export const PEER_MAX_AGE_MS = 24 * 60 * MINUTE

export type Phase = 'working' | 'idle' | 'ended'

/** One heartbeat file: what a session tells the others, kept under the repo's git folder. */
export type Peer = {
  id: string
  cwd: string
  branch: string
  phase: Phase
  at: number
  /** Repo-relative files this session wrote through Edit/Write/NotebookEdit. */
  files: string[]
}

export type Change = { path: string; code: string }

export type PeerKind = 'working' | 'idle' | 'maybe-gone' | 'ignore'

export function peerKind(p: Peer, now: number): PeerKind {
  if (p.phase === 'ended' || now - p.at > PEER_MAX_AGE_MS) return 'ignore'
  if (p.phase === 'idle') return 'idle'
  return now - p.at <= WORKING_FRESH_MS ? 'working' : 'maybe-gone'
}

export const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
export const sameDir = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase()

export const DEFAULT_BRANCHES = ['main', 'master', 'trunk', 'develop']
export const isDefaultBranch = (branch: string, originHead: string) =>
  branch !== '' && (branch === originHead || DEFAULT_BRANCHES.includes(branch))

const SECRET = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i,
  /\.(sqlite3?|db)$/i,
]
/** Files that are never swept into a click-commit: they stay for the owner to decide. */
export const isSecretPath = (p: string) => SECRET.some(r => r.test(norm(p)))

/** `git status --porcelain=v1 -z` into changes. A rename carries a second path that follows its own NUL. */
export function parseStatus(z: string): Change[] {
  const parts = z.split('\0')
  const out: Change[] = []
  for (let i = 0; i < parts.length; i++) {
    const row = parts[i] ?? ''
    if (row.length < 4) continue
    const code = row.slice(0, 2)
    out.push({ code, path: row.slice(3) })
    if (code[0] === 'R' || code[0] === 'C') i++ // skip the old name
  }
  return out
}

/** What a click-commit may take, and what it leaves. */
export type Pick = { take: string[]; leave: string[]; secrets: string[] }

/**
 * Rule: in a folder only that session worked in, take every change except secrets.
 * In a folder shared with other sessions, take only files this session wrote.
 */
export function pickFiles(changes: Change[], owned: readonly string[], isSoleOwner: boolean): Pick {
  const mine = new Set(owned.map(norm))
  const take: string[] = []
  const leave: string[] = []
  const secrets: string[] = []
  for (const c of changes) {
    if (isSecretPath(c.path)) secrets.push(c.path)
    else if (isSoleOwner || mine.has(norm(c.path))) take.push(c.path)
    else leave.push(c.path)
  }
  return { take, leave, secrets }
}

export type Facts = {
  now: number
  cwd: string
  branch: string
  originHead: string
  /** Detached HEAD, a merge or a rebase in progress. */
  isBusy: boolean
  changes: Change[]
  /** This session's own heartbeat (files it wrote). */
  mine: Peer | null
  peers: Peer[]
  /** Dirty changes found in each peer's folder, keyed by peer id. */
  peerChanges: Record<string, Change[]>
  /** Peers per folder, so a shared folder is known to be shared. */
  isFirstTurn: boolean
}

export type Advice =
  | { kind: 'main'; branch: string }
  | { kind: 'dirty'; count: number; onDefault: boolean }
  | { kind: 'shared-folder'; peerIds: string[] }
  | { kind: 'peer-working'; peerId: string; branch: string; cwd: string; isGone: boolean }
  | { kind: 'peer-done'; peerId: string; branch: string; cwd: string; take: number; leave: number; secrets: number; isSole: boolean }

/**
 * The rules, in the order they show (most urgent first):
 *  1. Another session works in THIS folder: nothing is safe here, go to a worktree. (shared-folder)
 *  2. On main/master: edits land on the shared branch, go to a worktree. (main)
 *  3. Uncommitted changes that no other session owns: checkpoint them first. (dirty)
 *  4. A session in another folder has finished a turn and left changes: commit them for it. (peer-done)
 *     Still working: say so and do not touch (peer-working).
 * Silent when none applies. A clean feature branch with no peers shows nothing.
 */
export function advise(f: Facts): Advice[] {
  const out: Advice[] = []
  const live = f.peers.filter(p => peerKind(p, f.now) !== 'ignore')
  const here = live.filter(p => sameDir(p.cwd, f.cwd))
  const elsewhere = live.filter(p => !sameDir(p.cwd, f.cwd))

  if (here.length > 0) out.push({ kind: 'shared-folder', peerIds: here.map(p => p.id) })
  if (isDefaultBranch(f.branch, f.originHead)) out.push({ kind: 'main', branch: f.branch })

  // Changes in this folder are "mine to checkpoint" only when no other live session shares the folder.
  if (here.length === 0 && f.changes.length > 0) {
    out.push({ kind: 'dirty', count: f.changes.length, onDefault: isDefaultBranch(f.branch, f.originHead) })
  }

  for (const p of elsewhere) {
    const kind = peerKind(p, f.now)
    if (kind === 'working') out.push({ kind: 'peer-working', peerId: p.id, branch: p.branch, cwd: p.cwd, isGone: false })
    else {
      const sharing = live.filter(q => sameDir(q.cwd, p.cwd)).length > 1
      const pk = pickFiles(f.peerChanges[p.id] ?? [], p.files, !sharing)
      if (pk.take.length + pk.secrets.length + pk.leave.length === 0) continue
      if (kind === 'maybe-gone' && (p.files.length === 0 || pk.take.length === 0)) continue
      out.push({
        kind: 'peer-done',
        peerId: p.id,
        branch: p.branch,
        cwd: p.cwd,
        take: pk.take.length,
        leave: pk.leave.length,
        secrets: pk.secrets.length,
        isSole: !sharing,
      })
    }
  }
  return out
}

export const short = (id: string) => id.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x'

export function slugOf(id: string, now: number): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `s-${short(id)}-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export const worktreePath = (root: string, slug: string) => `${norm(root)}/.claude/worktrees/${slug}`

export function checkpointMessage(count: number, branch: string): string {
  return `checkpoint: ${count} file${count === 1 ? '' : 's'} before starting new work on ${branch} [preflight-guard]`
}

export function peerCommitMessage(count: number, peerId: string, branch: string): string {
  return `checkpoint: ${count} file${count === 1 ? '' : 's'} finished by session ${short(peerId)} on ${branch} [preflight-guard]`
}

/** The repo-relative path of a file a tool wrote, or null when it lies outside the repo. */
export function relativeTo(root: string, file: string): string | null {
  const r = norm(root).toLowerCase()
  const f = norm(file)
  if (f.toLowerCase().startsWith(r + '/')) return f.slice(r.length + 1)
  return /^([a-z]:)?\//i.test(f) ? null : f
}

export const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const
