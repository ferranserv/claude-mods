/** The folder the plugins are installed from: the parent of this plugin's own folder. */
export function repoOf(pluginRoot: string): string {
  const trimmed = pluginRoot.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut > 0 ? trimmed.slice(0, cut) : ''
}

export const join = (dir: string, name: string): string => `${dir.replace(/[\\/]+$/, '')}/${name}`

/** The first line of `git rev-parse` output, or ''. */
export const headOf = (stdout: string): string => stdout.trim().split('\n')[0]?.trim() ?? ''

export const HOUR = 3_600_000
