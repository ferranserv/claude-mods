export type Level = 'easy' | 'hard' | 'unclear'
export type Price = { input: number; output: number }
export type Counts = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// iOS system colors, the same set the two bar mods use.
export const COLOR = {
  green: '#30D158',
  track: '#636366',
  text: '#AEAEB2',
  dim: '#8E8E93',
}

export const HAIKU_ID = 'claude-haiku-5-5'
// List price, dollars per million tokens (Haiku 5.5, prompts up to 100K).
export const HAIKU: Price = { input: 0.1, output: 0.5 }
export const CONTEXT_LIMIT = 100_000

const EASY =
  /\b(typos?|misspell\w*|spelling|renam\w+|reformat\w*|format\w*|prettier|indent\w*|whitespace|lint\w*|summar(?:y|ize|ise)|tl;?dr|recap|reword\w*|rephrase|capitali[sz]\w*|what does|what is|what's|quick question)\b/i

const HARD =
  /\b(plan|design|architect\w*|debug\w*|implement\w*|build|create|write|generate|refactor\w*|migrat\w*|investigat\w*|diagnos\w*|optimi[sz]\w*|step[- ]by[- ]step|failing|crash\w*|bugs?|root cause|why (?:is|does|did|isn't|doesn't)|new (?:feature|function|component|module|endpoint|class))\b/i

const LIST_ITEM = /^\s*(?:\d+[.)]|[-*])\s/

/** Decides from the words alone; `unclear` is the one case worth a model call. */
export function labelLocally(text: string): Level {
  const t = text.trim()
  if (t.length > 800) return 'hard'
  if (t.split('\n').filter(l => LIST_ITEM.test(l)).length >= 3) return 'hard'
  const isEasy = EASY.test(t)
  const isHard = HARD.test(t)
  if (isHard && !isEasy) return 'hard'
  if (isEasy && !isHard && t.length <= 400) return 'easy'
  // "yes", "go on", "ok do it": a follow-up belongs to whatever came before.
  if (t.length < 25) return 'hard'
  return 'unclear'
}

/** List price of a model id or alias as the session names it; null if unknown. */
export function priceOf(id: string): Price | null {
  const m = id.toLowerCase().replace(/\[.*\]$/, '')
  const isOld = /(?:^|[^\d])4[-.]\d/.test(m)
  if (m.includes('fable') || m.includes('mythos')) return { input: 10, output: 50 }
  if (m.includes('opus')) {
    if (isOld || /opus-5(?!-5)/.test(m)) return { input: 5, output: 25 }
    return { input: 4, output: 20 }
  }
  if (m.includes('sonnet')) {
    return isOld && m.includes('4-6') ? { input: 3, output: 15 } : { input: 2, output: 10 }
  }
  if (m.includes('haiku')) {
    return /haiku-4/.test(m) ? { input: 1, output: 5 } : HAIKU
  }
  return null
}

/** Input side counts every token the request was answered over, cached or not. */
export function costOf(price: Price, u: Counts): number {
  const inTokens =
    u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return (inTokens * price.input + u.output_tokens * price.output) / 1_000_000
}

export function savingOf(main: Price, u: Counts): number {
  return costOf(main, u) - costOf(HAIKU, u)
}

/** `claude-haiku-5-5` -> `haiku 5.5`. */
export function shortName(id: string): string {
  const m = id
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '')
  const f = m.match(/^([a-z]+)-(\d+)(?:-(\d+))?$/)
  return f ? `${f[1]} ${f[2]}${f[3] ? '.' + f[3] : ''}` : m
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function money(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

// A terminal column is about this many CSS pixels on the desktop app.
const PX_PER_COLUMN = 8

export function bandWidth(columns: number): number {
  return Math.max(320, Math.min(1600, Math.round(columns * PX_PER_COLUMN)))
}

/** A hairline with room above and below it, to set this strip apart from the bars above it. */
export function dividerSvg(width: number): { source: string; width: number; height: number } {
  const height = 15
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="7" width="${width}" height="1" rx="0.5" fill="#8E8E93" fill-opacity="0.45"/></svg>`
  return { source, width, height }
}
