export type Level = 'easy' | 'hard' | 'unclear'
import type { Price } from './lib'
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

/** Input side counts every token the request was answered over, cached or not. */
export function costOf(price: Price, u: Counts): number {
  const inTokens =
    u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  return (inTokens * price.input + u.output_tokens * price.output) / 1_000_000
}

export function savingOf(main: Price, u: Counts): number {
  return costOf(main, u) - costOf(HAIKU, u)
}

/**
 * What a routed step really saved. The prompt cache belongs to a model: Haiku has no cache of its own for this prefix, so
 * its input is billed as it came (reads at 10%, writes at 125%). The main model would have read the prefix from its warm
 * cache at 10% of its input price, or, cold, paid plain input. `mainWarm` says which; unknown counts as cold.
 */
export function realSaving(main: Price, u: Counts, mainWarm: boolean): number {
  const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const mainCost = ((mainWarm ? total * 0.1 : total) * main.input + u.output_tokens * main.output) / 1_000_000
  const haikuIn = u.input_tokens + u.cache_read_input_tokens * 0.1 + u.cache_creation_input_tokens * 1.25
  return mainCost - (haikuIn * HAIKU.input + u.output_tokens * HAIKU.output) / 1_000_000
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
