// One line per finished main-loop turn, for your own weekly look at where the tokens go. Local file, never sent anywhere.
export type TurnUsageLike = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export type TurnLogInput = {
  now: number
  session: string
  reason: string
  ms: number
  usage?: TurnUsageLike
  routed: boolean
  ctxPercent: number | null
}

/** The most lines kept per session file (the file is rewritten whole each turn, so it stays small). */
export const MAX_LINES = 2000

export function turnRow(i: TurnLogInput): string {
  const u = i.usage
  return JSON.stringify({
    t: new Date(i.now).toISOString(),
    session: i.session,
    reason: i.reason,
    ms: Math.round(i.ms),
    model: u?.model ?? '',
    in: u?.input_tokens ?? 0,
    out: u?.output_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
    routed: i.routed,
    ctx: i.ctxPercent === null ? null : Math.round(i.ctxPercent),
  })
}

export function logPath(home: string, session: string): string {
  const safe = session.replace(/[^\w-]/g, '_').slice(0, 64) || 'session'
  return `${home.replace(/\/$/, '')}/.claude/cockpit-log/${safe}.jsonl`
}

/** Adds one row to the rows already in the file, keeping the newest MAX_LINES. */
export function withRow(existing: string, row: string): string {
  const lines = existing.split('\n').filter(l => l.trim() !== '')
  lines.push(row)
  return lines.slice(-MAX_LINES).join('\n') + '\n'
}
