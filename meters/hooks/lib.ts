// Pure drawing code: the model of what to show, and the SVG and text it is drawn with.

export type Fill = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

// The context bar warns twice: orange from WARN_PAST percent (quality can start to slip), red past RED_PAST.
// A window can be 1M, so percent alone says "fine" long after every message has become expensive and
// long: LARGE_TOKENS is the same orange warning by size.
export const WARN_PAST = 50
export const RED_PAST = 80
export const LARGE_TOKENS = 150_000

export type Thresholds = { warnPercent: number; redPercent: number; warnTokens: number }
export const DEFAULT_LIMITS: Thresholds = { warnPercent: WARN_PAST, redPercent: RED_PAST, warnTokens: LARGE_TOKENS }

export const DAYS = ['M', 'T', 'W', 'T', 'F'] as const
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export const SLICE = 100 / DAYS.length

// iOS system colors.
export const C = {
  blue: '#0A84FF',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  gray: '#8E8E93',
}
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// ---------- the numbers ----------

export function kilo(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}

/** Weekday index in the Mon-Fri week (0..4); a weekend counts as Friday. */
export function workday(ms: number): number {
  const d = new Date(ms).getDay() // 0 Sun .. 6 Sat
  if (d === 0 || d === 6) return 4
  return d - 1
}

/** What the week has allotted through the end of today, in percent. */
export function allottedThrough(ms: number): number {
  return (workday(ms) + 1) * SLICE
}

export function pace(usedPercent: number, ms: number): string {
  const delta = Math.round(allottedThrough(ms) - usedPercent)
  if (delta > 0) return `${delta}% under`
  if (delta < 0) return `${-delta}% over`
  return 'on pace'
}

/** `2h 14m`, `40m`, `3d 2h`; empty when the window has no reset time. */
export function resetShort(resetsAt: string | undefined, ms: number): string {
  if (!resetsAt) return ''
  const diff = Date.parse(resetsAt) - ms
  if (!(diff > 0)) return 'now'
  const mins = Math.round(diff / 60_000)
  if (mins >= 36 * 60) return `${Math.floor(mins / 1440)}d ${Math.round((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${mins}m`
}

/** Fraction (0..1) of weekday slice `i` (0 = Mon) that is used. */
export function sliceFrac(usedPercent: number, i: number): number {
  return clamp((clamp(usedPercent, 0, 100) - SLICE * i) / SLICE, 0, 1)
}

/** The 5-hour bar: calm, then a warm warning, then red. */
export function usageColor(usedPercent: number): string {
  if (usedPercent >= 85) return C.red
  if (usedPercent >= 60) return C.orange
  return C.green
}

/** The weekly bar: green at or under today's allowance, orange past it, red when nearly out. */
export function weekColor(usedPercent: number, ms: number): string {
  if (usedPercent >= 90) return C.red
  if (usedPercent > allottedThrough(ms)) return C.orange
  return C.green
}

export type Level = 'calm' | 'warn' | 'alert'
export type Legend = { tone: Level; text: string; short: string }

export function levelOf(percent: number, tokens: number, t: Thresholds = DEFAULT_LIMITS): Level {
  if (percent > t.redPercent) return 'alert'
  if (percent >= t.warnPercent || tokens >= t.warnTokens) return 'warn'
  return 'calm'
}

/** The legend under the context meter: what the color means and what to do about it. */
export function legendFor(percent: number, tokens: number, t: Thresholds = DEFAULT_LIMITS): Legend {
  const level = levelOf(percent, tokens, t)
  if (level === 'alert') {
    return { tone: 'alert', text: `${pct(percent)} full. Hand off or /clear now.`, short: 'Nearly full. Hand off now.' }
  }
  if (level === 'warn') {
    return percent >= t.warnPercent
      ? { tone: 'warn', text: `${pct(percent)} full: quality may start to slip. Plan a handoff.`, short: 'Quality may slip. Plan a handoff.' }
      : { tone: 'warn', text: `${kilo(tokens)} re-read each message: quality may slip. Consider a handoff.`, short: 'Long context. Consider a handoff.' }
  }
  return { tone: 'calm', text: `Warns at ${t.warnPercent}% or ${kilo(t.warnTokens)} tokens.`, short: `Warns at ${t.warnPercent}%.` }
}

const toneColor = (t: Level) => (t === 'alert' ? C.red : t === 'warn' ? C.orange : C.gray)

// ---------- the prompt cache ----------

export type Price = { input: number; output: number }

/** List price, dollars per million tokens, by model id or alias as the session names it; null if unknown. */
export function priceOf(id: string): Price | null {
  const m = id.toLowerCase().replace(/\[.*\]$/, '')
  const isOld = /(?:^|[^\d])4[-.]\d/.test(m)
  if (m.includes('fable') || m.includes('mythos')) return { input: 10, output: 50 }
  if (m.includes('opus')) return isOld || /opus-5(?!-5)/.test(m) ? { input: 5, output: 25 } : { input: 4, output: 20 }
  if (m.includes('sonnet')) return isOld && m.includes('4-6') ? { input: 3, output: 15 } : { input: 2, output: 10 }
  if (m.includes('haiku')) return /haiku-4/.test(m) ? { input: 1, output: 5 } : { input: 0.1, output: 0.5 }
  return null
}

export function money(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/** What the cache is known to be: learned from the API's own behaviour, else the user's setting. */
export type CacheState = {
  lastAt: number // ms of the last main-loop response; 0 before the first
  detected: 5 | 60 | null
  misses: number // consecutive full misses after an idle gap that a 1-hour cache would have survived
  notifiedAt: number // the lastAt a "going cold" notice was already sent for
  override: number | null // minutes the user set with /cache
  fallback: number // minutes when nothing is known (60)
}

export const CACHE_INITIAL: CacheState = { lastAt: 0, detected: null, misses: 0, notifiedAt: 0, override: null, fallback: 60 }

export const windowMinutes = (c: CacheState): number => c.override ?? c.detected ?? c.fallback

export type StepUsage = { input: number; read: number; create: number }

/**
 * Learns the cache window from one request that followed an idle gap. The API reports no TTL, so:
 * a hit after more than five minutes proves the one-hour cache; two full misses inside the hour,
 * each after more than five minutes, mean the five-minute one. A proven hour is never undone.
 */
export function learnWindow(c: CacheState, gapMs: number, u: StepUsage): CacheState {
  const gap = gapMs / 60_000
  const total = u.input + u.read + u.create
  if (total <= 0 || gap <= 5.5) return c
  if (u.read > 0 && u.read >= 0.5 * total) return { ...c, detected: 60, misses: 0 }
  if (c.detected === 60) return c
  if (gap < 59 && u.read === 0 && u.create >= 0.5 * total) {
    const misses = c.misses + 1
    return { ...c, misses, detected: misses >= 2 ? 5 : c.detected }
  }
  return c
}

export type CacheState3 = 'unknown' | 'warm' | 'soon' | 'cold'

export type CacheView = {
  state: CacheState3
  leftMs: number
  frac: number // share of the window still left, 0..1
  windowMin: number
  isLearned: boolean
  label: string // 42:10, 1:04:00, cold, -
  warmUsd: number | null
  coldUsd: number | null
}

export function clockText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Input-side cost of the next request over `tokens` of context: cache read if warm, cache write if cold. */
export function nextCost(tokens: number, price: Price, windowMin: number): { warm: number; cold: number } {
  return {
    warm: (tokens * price.input * 0.1) / 1e6,
    cold: (tokens * price.input * (windowMin > 5 ? 2 : 1.25)) / 1e6,
  }
}

export function cacheView(c: CacheState, now: number, tokens: number, price: Price | null, soonMin = 5): CacheView {
  const windowMin = windowMinutes(c)
  const cost = price && tokens > 0 ? nextCost(tokens, price, windowMin) : null
  const base = { windowMin, isLearned: c.override === null && c.detected !== null, warmUsd: cost?.warm ?? null, coldUsd: cost?.cold ?? null }
  if (c.lastAt <= 0) return { ...base, state: 'unknown', leftMs: 0, frac: 0, label: '-' }
  const leftMs = c.lastAt + windowMin * 60_000 - now
  if (leftMs <= 0) return { ...base, state: 'cold', leftMs: 0, frac: 0, label: 'cold' }
  const frac = clamp(leftMs / (windowMin * 60_000), 0, 1)
  const isSoon = leftMs <= Math.min(soonMin, windowMin / 2) * 60_000
  return { ...base, state: isSoon ? 'soon' : 'warm', leftMs, frac, label: clockText(leftMs) }
}

const cacheColor = (v: CacheView): string => (v.state === 'warm' ? C.green : v.state === 'soon' ? C.orange : v.state === 'cold' ? C.red : C.gray)

// ---------- the model ----------

/** Text drawn in one or more colors; the options of a value go longest first. */
export type Parts = { t: string; fill: string }[]

export type CacheModel = { view: CacheView; color: string; value: Parts[]; sub: string; subShort: string }

export type Model = {
  ctx: { percent: number; level: Level; color: string; value: Parts[]; legend: Legend }
  five: { used: number; color: string; value: Parts[]; sub: string }
  week: {
    used: number
    color: string
    today: number
    value: Parts[]
    paceText: string
    paceColor: string
  }
  cache?: CacheModel
}

export type CacheInput = { state: CacheState; price: Price | null; soonMin?: number }
export type Data = { fill: Fill | null; limits: Limit[]; now: number; cache?: CacheInput; limitsAt?: Thresholds }

export function model(d: Data): Model {
  const g = (t: string, fill = C.gray) => [{ t, fill }]
  const t = d.limitsAt ?? DEFAULT_LIMITS

  const percent = d.fill?.percent ?? 0
  const tokens = d.fill?.tokens ?? 0
  const legend = legendFor(percent, tokens, t)
  const level = levelOf(percent, tokens, t)
  const ctx = {
    percent,
    level,
    color: level === 'alert' ? C.red : level === 'warn' ? C.orange : C.blue,
    value: d.fill
      ? [g(`${pct(percent)} · ${kilo(tokens)} / ${kilo(d.fill.window)}`), g(pct(percent))]
      : [g('-')],
    legend,
  }

  const f = d.limits.find(l => l.kind === 'five_hour')
  const fiveUsed = f?.percentUsed ?? 0
  const reset = f ? resetShort(f.resetsAt, d.now) : ''
  const five = {
    used: fiveUsed,
    color: usageColor(fiveUsed),
    value: f ? [g(`${pct(fiveUsed)} used`), g(pct(fiveUsed))] : [g('-')],
    sub: f ? (reset ? `Resets in ${reset}` : '') : 'Shows after the first reply',
  }

  const w = d.limits.find(l => l.kind === 'seven_day')
  const used = w?.percentUsed ?? 0
  const today = workday(d.now)
  const over = used > allottedThrough(d.now)
  const paceColor = over ? C.orange : C.green
  const paceText = `${DAY_NAMES[today]} ${pace(used, d.now)}`
  const week = {
    used,
    color: weekColor(used, d.now),
    today,
    paceText,
    paceColor,
    value: w
      ? [
          [...g(`${pct(used)} used · `), { t: paceText, fill: paceColor }],
          g(`${pct(used)} used`),
          g(pct(used)),
        ]
      : [g('-')],
  }

  let cache: CacheModel | undefined
  if (d.cache) {
    const v = cacheView(d.cache.state, d.now, tokens, d.cache.price, d.cache.soonMin)
    const color = cacheColor(v)
    const win = `${v.windowMin >= 60 ? v.windowMin / 60 + 'h' : v.windowMin + 'm'}${v.isLearned ? '' : ' (set)'}`
    const costs = v.warmUsd !== null && v.coldUsd !== null
    cache = {
      view: v,
      color,
      value: [g(v.label, color)],
      sub:
        v.state === 'unknown'
          ? 'Starts after the first reply'
          : costs
            ? `Next msg ${money(v.warmUsd ?? 0)} · cold ${money(v.coldUsd ?? 0)}`
            : `${win} window`,
      subShort: costs ? `${money(v.warmUsd ?? 0)} / ${money(v.coldUsd ?? 0)} cold` : win,
    }
  }

  return { ctx, five, week, cache }
}

export function altText(m: Model): string {
  const cache = m.cache ? `, prompt cache ${m.cache.view.state === 'cold' ? 'cold' : m.cache.view.label}` : ''
  return `Context ${pct(m.ctx.percent)} full, 5-hour limit ${pct(m.five.used)} used, weekly limit ${pct(m.week.used)} used (${m.week.paceText})${cache}`
}

// ---------- SVG ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Average glyph width as a share of the font size, for the system sans faces the band names.
// Measured text is not available to a mod, so this is an estimate; 0.54 sits between SF Pro and Segoe UI.
const EST = 0.54

const estimate = (s: string, size: number) => s.length * size * EST

const joined = (p: Parts) => p.map(x => x.t).join('')

/** The longest option that fits `room` px; else the last one, clipped. */
function fit(options: Parts[], room: number, size: number): Parts {
  for (const o of options) if (estimate(joined(o), size) <= room) return o
  const last = options[options.length - 1] ?? []
  const max = Math.max(1, Math.floor(room / (size * EST)))
  const text = joined(last)
  return text.length <= max ? last : [{ t: text.slice(0, max - 1) + '…', fill: last[0]?.fill ?? C.gray }]
}

function clip(text: string, room: number, size: number): string {
  const max = Math.max(1, Math.floor(room / (size * EST)))
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

/** Breaks `text` into at most `maxLines` lines of `room` px, or null when it will not fit. */
export function wrapLines(text: string, room: number, size: number, maxLines: number): string[] | null {
  const per = Math.max(4, Math.floor(room / (size * EST)))
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(' ')) {
    const next = cur === '' ? word : `${cur} ${word}`
    if (next.length <= per) cur = next
    else {
      if (cur !== '') lines.push(cur)
      cur = word
    }
  }
  if (cur !== '') lines.push(cur)
  return lines.length <= maxLines && lines.every(l => l.length <= per) ? lines : null
}

/** The full message if it fits in `maxLines` lines, else the short one, clipped as a last resort. */
export function legendLines(l: Legend, room: number, size: number, maxLines: number): string[] {
  return wrapLines(l.text, room, size, maxLines) ?? wrapLines(l.short, room, size, maxLines) ?? [clip(l.short, room, size)]
}

type TextOpts = { size?: number; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number }

function text(x: number, y: number, s: string, o: TextOpts = {}): string {
  const { size = 11, anchor = 'start', fill = C.gray, weight = 400 } = o
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`
}

function parts(x: number, y: number, p: Parts, o: TextOpts = {}): string {
  const { size = 11, anchor = 'start', weight = 500 } = o
  const spans = p.map(s => `<tspan fill="${s.fill}">${esc(s.t)}</tspan>`).join('')
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${spans}</text>`
}

const rect = (x: number, y: number, w: number, h: number, fill: string, opacity = 1) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3.5, h / 2, w / 2).toFixed(1)}" fill="${fill}" fill-opacity="${opacity}"/>`

const TRACK = 0.25

function wrapSvg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${body}</svg>`
}

// A terminal column is about this many CSS pixels on the desktop app. The band is drawn this wide and the
// Svg element is given no width of its own, so the app shrinks it to the slot instead of clipping it.
const PX_PER_COLUMN = 8

export function bandWidth(columns: number): number {
  return clamp(Math.round(columns * PX_PER_COLUMN), 320, 1600)
}

const LEGEND_SIZE = 9
const LINE = 10

/** One slim band: the meters side by side, a few lines tall. */
export function bandSvg(width: number, m: Model): { source: string; width: number; height: number } {
  // Context and Weekly carry the most text (a warning, the pace); 5-hour the least.
  const weights = m.cache ? [1.2, 0.85, 1.2, 1] : [1, 1, 1]
  const gap = 24
  const usable = width - (weights.length - 1) * gap
  const total = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map(w => Math.floor((usable * w) / total))
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b + gap, 0))
  const [x0 = 0, x1 = 0, x2 = 0, x3 = 0] = xs
  const [w0 = 0, w1 = 0, w2 = 0, w3 = 0] = widths
  let out = ''

  // Context: the legend takes up to two lines under the bar, so a long warning is read whole.
  const legend = legendLines(m.ctx.legend, w0, LEGEND_SIZE, 2)
  out += text(x0, 11, 'Context', { size: 11 })
  out += parts(x0 + w0, 11, fit(m.ctx.value, w0 - 52, 11), { anchor: 'end' })
  out += rect(x0, 17, w0, 7, C.gray, TRACK)
  if (m.ctx.percent > 0) out += rect(x0, 17, Math.max(7, (w0 * clamp(m.ctx.percent, 0, 100)) / 100), 7, m.ctx.color)
  legend.forEach((l, i) => {
    out += text(x0, 38 + i * LINE, l, { size: LEGEND_SIZE, fill: toneColor(m.ctx.legend.tone) })
  })
  const height = 38 + (legend.length - 1) * LINE + 7

  // 5-hour
  out += text(x1, 11, '5-hour', { size: 11 })
  out += parts(x1 + w1, 11, fit(m.five.value, w1 - 46, 11), { anchor: 'end' })
  out += rect(x1, 17, w1, 7, C.gray, TRACK)
  if (m.five.used > 0) out += rect(x1, 17, Math.max(7, (w1 * clamp(m.five.used, 0, 100)) / 100), 7, m.five.color)
  out += text(x1, 38, clip(m.five.sub, w1, LEGEND_SIZE), { size: LEGEND_SIZE })

  // Weekly: five slots with a clear gap between them, a day letter centered under each
  out += text(x2, 11, 'Weekly', { size: 11 })
  out += parts(x2 + w2, 11, fit(m.week.value, w2 - 46, 11), { anchor: 'end' })
  const slotGap = 4
  const slotW = (w2 - 4 * slotGap) / 5
  DAYS.forEach((letter, i) => {
    const sx = x2 + i * (slotW + slotGap)
    out += rect(sx, 17, slotW, 7, C.gray, TRACK)
    const f = sliceFrac(m.week.used, i)
    if (f > 0) out += rect(sx, 17, Math.max(7, slotW * f), 7, m.week.color)
    out += text(sx + slotW / 2, 38, letter, {
      size: LEGEND_SIZE,
      anchor: 'middle',
      fill: i === m.week.today ? C.blue : C.gray,
      weight: i === m.week.today ? 700 : 400,
    })
  })

  // Prompt cache: a bar that drains, the time left, and what the next message costs warm and cold
  if (m.cache) {
    const c = m.cache
    out += text(x3, 11, 'Cache', { size: 11 })
    out += parts(x3 + w3, 11, fit(c.value, w3 - 40, 11), { anchor: 'end' })
    out += rect(x3, 17, w3, 7, C.gray, TRACK)
    if (c.view.frac > 0) out += rect(x3, 17, Math.max(7, w3 * c.view.frac), 7, c.color)
    const sub = estimate(c.sub, LEGEND_SIZE) <= w3 ? c.sub : c.subShort
    out += text(x3, 38, clip(sub, w3, LEGEND_SIZE), { size: LEGEND_SIZE, fill: c.view.state === 'soon' ? C.orange : C.gray })
  }

  return { source: wrapSvg(width, height, out), width, height }
}

/** A hairline with room above and below it, to set one band apart from the next. */
export function dividerSvg(width: number): { source: string; width: number; height: number } {
  const height = 15
  return { source: wrapSvg(width, height, rect(0, 7, width, 1, C.gray, 0.35)), width, height }
}

export function sideWidth(columns: number): number {
  return clamp(Math.round(columns * PX_PER_COLUMN), 196, 260)
}

/** A vertical panel: bars rise from the bottom; the week is five stacked slots, Monday lowest. */
export function sideSvg(width: number, m: Model): { source: string; width: number; height: number } {
  const w = Math.max(196, width)
  const top = 22
  const barH = 136
  const barW = 16
  const hasCache = m.cache !== undefined
  const at = hasCache ? [0.12, 0.35, 0.6, 0.86] : [0.16, 0.46, 0.74]
  const cx = at.map(f => Math.round(w * f))
  const bottom = top + barH
  let out = ''

  const column = (x: number, label: string, value: string, valueFill: string) => {
    out += text(x, 12, value, { size: 11, anchor: 'middle', fill: valueFill, weight: 600 })
    out += text(x, bottom + 15, label, { size: 10, anchor: 'middle' })
  }
  const bar = (x: number, percent: number, color: string) => {
    out += rect(x - barW / 2, top, barW, barH, C.gray, TRACK)
    if (percent > 0) {
      const h = Math.max(barW, (barH * clamp(percent, 0, 100)) / 100)
      out += rect(x - barW / 2, bottom - h, barW, h, color)
    }
  }

  // Context
  column(cx[0] ?? 0, 'Context', pct(m.ctx.percent), m.ctx.level === 'calm' ? C.gray : m.ctx.color)
  bar(cx[0] ?? 0, m.ctx.percent, m.ctx.color)

  // 5-hour
  column(cx[1] ?? 0, '5-hour', pct(m.five.used), C.gray)
  bar(cx[1] ?? 0, m.five.used, m.five.color)
  const reset = m.five.sub.replace('Resets in ', '')
  if (reset && !m.five.sub.startsWith('Shows')) {
    out += text(cx[1] ?? 0, bottom + 28, reset, { size: 9, anchor: 'middle' })
  }

  // Weekly: five slots, Monday at the bottom, each day letter centered beside its slot
  column(cx[2] ?? 0, 'Weekly', pct(m.week.used), C.gray)
  const slotGap = 4
  const slotH = (barH - 4 * slotGap) / 5
  const wx = (cx[2] ?? 0) - barW / 2
  DAYS.forEach((letter, i) => {
    const sy = bottom - (i + 1) * slotH - i * slotGap
    out += rect(wx, sy, barW, slotH, C.gray, TRACK)
    const f = sliceFrac(m.week.used, i)
    if (f > 0) {
      const h = Math.max(7, slotH * f)
      out += rect(wx, sy + slotH - h, barW, h, m.week.color)
    }
    out += text(wx + barW + 8, sy + slotH / 2 + 3.5, letter, {
      size: 10,
      fill: i === m.week.today ? C.blue : C.gray,
      weight: i === m.week.today ? 700 : 400,
    })
  })
  out += text(cx[2] ?? 0, bottom + 28, clip(m.week.paceText, 64, 9), {
    size: 9,
    anchor: 'middle',
    fill: m.week.paceColor,
  })

  // Prompt cache: drains from the top as time runs out
  if (m.cache) {
    const c = m.cache
    const x = cx[3] ?? 0
    column(x, 'Cache', c.view.label, c.color)
    bar(x, c.view.frac * 100, c.color)
    if (c.view.warmUsd !== null && c.view.coldUsd !== null) {
      out += text(x, bottom + 28, money(c.view.warmUsd), { size: 9, anchor: 'middle' })
      out += text(x, bottom + 39, `${money(c.view.coldUsd)} cold`, { size: 9, anchor: 'middle', fill: C.orange })
    }
  }

  // The legend: up to three short lines under everything
  const legend = legendLines(m.ctx.legend, w - 12, LEGEND_SIZE, 3)
  const legendTop = bottom + (m.cache ? 56 : 46)
  legend.forEach((line, i) => {
    out += text(w / 2, legendTop + i * 12, line, { size: LEGEND_SIZE, anchor: 'middle', fill: toneColor(m.ctx.legend.tone) })
  })
  const height = legendTop + (legend.length - 1) * 12 + 8

  return { source: wrapSvg(w, height, out), width: w, height }
}

// ---------- terminal fallback: one short line of text ----------

export type Segment = { t: string; fill: string }

export function cells(percent: number, width: number): number {
  const p = clamp(percent, 0, 100)
  if (p === 0) return 0
  return Math.max(1, Math.round((p / 100) * width))
}

export function line(m: Model, bar = m.cache ? 6 : 8): Segment[] {
  const out: Segment[] = []
  const meter = (label: string, percent: number, color: string, tail = `${pct(percent)}`) => {
    const n = cells(percent, bar)
    out.push({ t: `${label} `, fill: C.gray })
    if (n > 0) out.push({ t: '━'.repeat(n), fill: color })
    out.push({ t: '━'.repeat(bar - n), fill: '#636366' })
    out.push({ t: ` ${tail}`, fill: C.gray })
  }
  meter('Context', m.ctx.percent, m.ctx.color)
  out.push({ t: '   ', fill: C.gray })
  meter('5h', m.five.used, m.five.color)
  out.push({ t: '   ', fill: C.gray })
  meter('Week', m.week.used, m.week.color)
  out.push({ t: ` ${m.week.paceText}`, fill: m.week.paceColor })
  if (m.cache) {
    out.push({ t: '   ', fill: C.gray })
    meter('Cache', m.cache.view.frac * 100, m.cache.color, m.cache.view.label)
  }
  if (m.ctx.legend.tone !== 'calm') {
    const short = m.ctx.legend.tone === 'alert' ? 'nearly full: hand off now' : 'quality may slip'
    out.push({ t: `   ${short}`, fill: toneColor(m.ctx.legend.tone) })
  }
  return out
}
