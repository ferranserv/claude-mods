import type { EngineInterface, Register } from 'claude-code'

import { HOUR, headOf, join, repoOf } from './paths'

// Best effort, never blocking: pulls the folder the mods are installed from, so a merged pull request
// reaches the next session without a manual `git pull`. The new files load when the next session starts.
async function git($: EngineInterface, repo: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await $.process.run(['git', '-C', repo, ...args], { timeoutMs: 30_000 })
    return { ok: r.exitCode === 0, out: r.stdout }
  } catch {
    return { ok: false, out: '' }
  }
}

/** Returns a one-line report; `isForced` skips the throttle (the /updatemods command). */
async function update($: EngineInterface, minHours: number, isForced: boolean): Promise<string> {
  const repo = repoOf($.plugin.root)
  if (repo === '' || !(await $.fs.exists(join(repo, '.git')))) return 'Not a git folder, so nothing to pull. (Installed from GitHub or a ZIP: update from the Plugins menu.)'

  const now = await $.clock.now()
  const last = Number(await $.store.get('lastPull')) || 0
  if (!isForced && now - last < minHours * HOUR) return 'Checked recently.'

  const before = await git($, repo, ['rev-parse', 'HEAD'])
  if (!before.ok) {
    if ((await $.store.get('noticedNoGit')) !== true) {
      await $.store.set('noticedNoGit', true)
      $.ui.toast('mods-manager: cannot run git here, so mods will not update by themselves. Run git pull in the mods folder.')
    }
    return 'Cannot run git here (no git, or this app does not allow commands).'
  }

  const pulled = await git($, repo, ['pull', '--ff-only', '--quiet'])
  await $.store.set('lastPull', now)
  if (!pulled.ok) return 'git pull did not finish (offline, local changes, or the folder diverged). Nothing changed.'

  const after = await git($, repo, ['rev-parse', 'HEAD'])
  if (after.ok && headOf(after.out) !== headOf(before.out)) {
    const short = headOf(after.out).slice(0, 7)
    $.ui.toast(`Mods updated to ${short}. Start a new session to load them.`)
    return `Updated ${headOf(before.out).slice(0, 7)} -> ${short}. Start a new session to load the new versions.`
  }
  return 'Already up to date.'
}

export const register: Register = (on, options) => {
  const isAuto = options.autoUpdate !== false
  const minHours = Math.max(0, Number(options.minHours ?? 1) || 0)

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'updatemods', description: 'Pull the latest mods from GitHub now (a new session loads them)' })
    } catch {
      // The name is taken: the automatic update still runs.
    }
    // After the session is up, so a slow network never delays the start.
    if (isAuto) $.clock.after(3000, () => void update($, minHours, false))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'updatemods' }, async $ => ({ text: await update($, minHours, true) }))
}
