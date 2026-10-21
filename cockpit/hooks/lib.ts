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
  lastAt: number // ms the cache was last used: set when you send a message and at each request; 0 before the first
  lastEndAt: number // ms the last request finished: the idle gap the window is learned from
  detected: 5 | 60 | null
  misses: number // consecutive full misses after an idle gap that a 1-hour cache would have survived
  notifiedAt: number // the lastAt a "going cold" notice was already sent for
  override: number | null // minutes the user set with /cache
  fallback: number // minutes when nothing is known (60)
}

export const CACHE_INITIAL: CacheState = { lastAt: 0, lastEndAt: 0, detected: null, misses: 0, notifiedAt: 0, override: null, fallback: 60 }

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

/**
 * The countdown. `leftMs` is exact (the notice and /cache use it); `label` and `frac` move in steps of
 * `stepMin` minutes, rounded UP so a message you just sent reads the full window (60m, 55m, 50m, ... then
 * <5m). It can read up to one step more than is left, never less; the last step and the notice are exact.
 */
export function cacheView(c: CacheState, now: number, tokens: number, price: Price | null, soonMin = 5, stepMin = 5): CacheView {
  const windowMin = windowMinutes(c)
  const cost = price && tokens > 0 ? nextCost(tokens, price, windowMin) : null
  const base = { windowMin, isLearned: c.override === null && c.detected !== null, warmUsd: cost?.warm ?? null, coldUsd: cost?.cold ?? null }
  if (c.lastAt <= 0) return { ...base, state: 'unknown', leftMs: 0, frac: 0, label: '-' }
  const leftMs = c.lastAt + windowMin * 60_000 - now
  if (leftMs <= 0) return { ...base, state: 'cold', leftMs: 0, frac: 0, label: 'cold' }
  const step = Math.max(1, stepMin)
  const stepMs = step * 60_000
  const isWhole = leftMs >= stepMs
  const shownMs = isWhole ? Math.min(Math.ceil(leftMs / stepMs) * stepMs, windowMin * 60_000) : leftMs
  const frac = clamp(shownMs / (windowMin * 60_000), 0, 1)
  const isSoon = leftMs <= Math.min(soonMin, windowMin / 2) * 60_000
  return { ...base, state: isSoon ? 'soon' : 'warm', leftMs, frac, label: isWhole ? `${shownMs / 60_000}m` : `<${step}m` }
}

const cacheColor = (v: CacheView): string => (v.state === 'warm' ? C.green : v.state === 'soon' ? C.orange : v.state === 'cold' ? C.red : C.gray)

// ---------- the model ----------

/** Text drawn in one or more colors; the options of a value go longest first. */
export type Parts = { t: string; fill: string }[]

export type CacheModel = { view: CacheView; color: string; value: Parts[]; sub: string; subShort: string; near: boolean }

export type Model = {
  ctx: { percent: number; level: Level; color: string; value: Parts[]; legend: Legend; near: boolean }
  five: { used: number; color: string; value: Parts[]; sub: string; subShort: string }
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

export type CacheInput = { state: CacheState; price: Price | null; soonMin?: number; stepMin?: number }
export type Data = { fill: Fill | null; limits: Limit[]; now: number; cache?: CacheInput; limitsAt?: Thresholds }

/** HH:MM in the person's time. */
function clockAt(iso: string | undefined): string {
  const dt = iso ? new Date(iso) : null
  if (!dt || Number.isNaN(dt.getTime())) return '--:--'
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

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
    // Close to the first warning: the small print under the bar appears only from here.
    near: level !== 'calm' || percent >= t.warnPercent * 0.8 || tokens >= t.warnTokens * 0.8,
  }

  // A limit past its reset time has reset, whatever was last measured: the next reply brings the new number,
  // but until then it counts as unused (the alarm clock must not outlast the limit).
  const isLive = (l: Limit | undefined): l is Limit => l !== undefined && !(l.resetsAt !== undefined && Date.parse(l.resetsAt) <= d.now)
  const f = d.limits.find(l => l.kind === 'five_hour')
  const fiveUsed = isLive(f) ? f.percentUsed : 0
  const reset = f ? resetShort(f.resetsAt, d.now) : ''
  const five = {
    used: fiveUsed,
    color: usageColor(fiveUsed),
    value: f ? [g(`${pct(fiveUsed)} used`), g(pct(fiveUsed))] : [g('-')],
    sub: f ? (reset ? `Resets at ${clockAt(f.resetsAt)} (in ${reset})` : isLive(f) ? '' : 'Window reset') : 'Shows after the first reply',
    subShort: f ? (reset ? `Resets ${clockAt(f.resetsAt)}` : '') : 'After the first reply',
  }

  const w = d.limits.find(l => l.kind === 'seven_day')
  const used = isLive(w) ? w.percentUsed : 0
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
          [...g(`${pct(used)} · `), { t: paceText.replace(/^\w+ /, ''), fill: paceColor }],
          g(`${pct(used)} used`),
          g(pct(used)),
        ]
      : [g('-')],
  }

  let cache: CacheModel | undefined
  if (d.cache) {
    const v = cacheView(d.cache.state, d.now, tokens, d.cache.price, d.cache.soonMin, d.cache.stepMin)
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
      near: v.state === 'soon' || v.state === 'cold' || (v.state === 'warm' && v.leftMs <= 10 * 60_000),
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
const EST = 0.6

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

const LEGEND_SIZE = 10
const LINE = 10

/** The enhance wand: flat and one color (the cockpit gray), drawn as shapes so no emoji font can color or shade it. A stick, a gap, then the sparkle apart from it, and a small one. 18 px, like the controls around it. */
export function wandSvg(dim: boolean): { source: string; width: number; height: number } {
  const o = dim ? 0.45 : 1
  const out = `<g transform="scale(0.75)" fill="${C.gray}" stroke="${C.gray}" fill-opacity="${o}" stroke-opacity="${o}"><path d="M3 22L12 13" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M19 1L20.6 5.4L25 7L20.6 8.6L19 13L17.4 8.6L13 7L17.4 5.4Z" stroke="none"/><path d="M6 3V9M3 6H9" stroke-width="1.6" stroke-linecap="round" fill="none"/></g>`
  return { source: wrapSvg(18, 18, out), width: 18, height: 18 }
}

const BUBBLE_H = 26
/** Height of a further line of text in the bubble. */
const BUBBLE_LINE = 14
const BUBBLE_SIZE = 12
/** Where the text starts inside the bubble, so it does not move while the bubble is resized. */
const TEXT_X = 12
/** Room around a bubble drawn on its own: the tail on the left, the shadow all round. */
const BUBBLE_PAD = { x: 8, y: 6 }
/** One character cell of the host, in px: boxes are laid out in whole cells. */
export const CELL = { w: 8, h: 18 }

/** The text as at most two lines that fit `inner` px (the second ends in an ellipsis if it must be cut), and the width the longest takes. */
export function fitLines(text: string, inner: number, size = BUBBLE_SIZE): { lines: string[]; width: number } {
  if (estimate(text, size) <= inner) return { lines: [text], width: Math.ceil(estimate(text, size)) }
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(' ')) {
    const next = cur === '' ? word : `${cur} ${word}`
    if (estimate(next, size) <= inner || cur === '') cur = next
    else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur !== '') lines.push(cur)
  let out = lines.slice(0, 2)
  if (lines.length > 2) {
    let last = `${out[1] ?? ''} ${lines.slice(2).join(' ')}`.trim()
    while (last.length > 1 && estimate(`${last}…`, size) > inner) last = last.slice(0, -1)
    out = [out[0] ?? '', `${last.trimEnd()}…`]
  }
  out = out.map(l => (estimate(l, size) <= inner ? l : `${l.slice(0, Math.max(1, Math.floor(inner / (size * EST)) - 1))}…`))
  return { lines: out, width: Math.ceil(Math.max(...out.map(l => estimate(l, size)))) }
}

/**
 * Clawd's speech bubble in pixels: the cockpit gray inside, a dark stepped border, a tail pointing left to Clawd and
 * regular text of one or two lines. What is behind it is dimmed by a shadow in the bubble's own shape. It materializes
 * (grows with a small overshoot and fades in). (bx, by) is its top left.
 */
function bubbleOut(lines: string[], bx: number, by: number, w: number): string {
  const h = BUBBLE_H + (lines.length - 1) * BUBBLE_LINE
  const cx = bx + Math.round(w / 2)
  const cy = by + h / 2
  const r = (x: number, y: number, rw: number, rh: number, c: string) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"/>`
  const D = '#0b0705'
  const G = C.gray
  const top = by + Math.round((h - lines.length * BUBBLE_LINE) / 2) + 11
  const art = [
    r(bx + 2, by, w - 4, h, D), r(bx, by + 2, w, h - 4, D), // the border: a block with its corners stepped
    r(bx + 4, by + 2, w - 8, h - 4, G), r(bx + 2, by + 4, w - 4, h - 8, G), // the inside, stepped the same way
    r(bx, by + 10, 2, 6, G), // the opening in the border for the tail
    r(bx - 2, by + 8, 2, 10, D), r(bx - 2, by + 10, 2, 6, G),
    r(bx - 4, by + 10, 2, 6, D), r(bx - 4, by + 12, 2, 2, G),
    r(bx - 6, by + 12, 2, 2, D),
    ...lines.map((l, i) => `<text x="${bx + TEXT_X}" y="${top + i * BUBBLE_LINE}" font-size="${BUBBLE_SIZE}" font-weight="400" fill="#1b1a19">${esc(l)}</text>`),
  ].join('')
  // The shadow has the bubble's own stepped shape: a few copies, each a pixel wider and fainter, so it fades out
  // over 4 px all round.
  const silhouette = (g: number) => `<rect x="${bx + 2 - g}" y="${by - g}" width="${w - 4 + 2 * g}" height="${h + 2 * g}" fill="#000" fill-opacity="0.07"/><rect x="${bx - g}" y="${by + 2 - g}" width="${w + 2 * g}" height="${h - 4 + 2 * g}" fill="#000" fill-opacity="0.07"/>`
  const dim = [4, 3, 2, 1].map(silhouette).join('')
  const anim = '<animate attributeName="opacity" from="0" to="1" dur="0.26s" fill="freeze"/>'
  const grow = '<animateTransform attributeName="transform" type="scale" values="0.55;1.06;1" keyTimes="0;0.65;1" dur="0.26s" fill="freeze"/>'
  return `<g transform="translate(${cx} ${cy})">${anim}<g>${grow}<g transform="translate(${-cx} ${-cy})">${dim}${art}</g></g></g>`
}

/**
 * A button drawn as pixels: the cockpit gray of the bubble, dark text, the same stepped border. It is a whole number of
 * character cells wide and one row tall, so the real Button laid over it (blank text, clipped to the same cells) covers
 * exactly what is drawn and nothing else.
 */
export function pillSvg(label: string): { source: string; width: number; height: number; cols: number } {
  const size = 11
  const cols = Math.max(3, Math.ceil((estimate(label, size) + 18) / CELL.w))
  const w = cols * CELL.w
  const h = CELL.h
  const r = (x: number, y: number, rw: number, rh: number, c: string) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"/>`
  const body = [
    r(2, 0, w - 4, h, '#0b0705'), r(0, 2, w, h - 4, '#0b0705'),
    r(4, 2, w - 8, h - 4, C.gray), r(2, 4, w - 4, h - 8, C.gray),
    `<text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" font-size="${size}" font-weight="500" fill="#1b1a19">${esc(label)}</text>`,
  ].join('')
  return { source: wrapSvg(w, h, body), width: w, height: h, cols }
}

const bubbleLayout = (text: string, room: number) => {
  const { lines, width } = fitLines(text, Math.max(60, room - 24))
  return { lines, w: Math.max(60, width + 2 * TEXT_X), h: BUBBLE_H + (lines.length - 1) * BUBBLE_LINE }
}

/**
 * The speech bubble as its own drawing: one or two lines that fit `room` px, in a row under the band, with its buttons
 * beside it. Fresh, it materializes. When it gives way to another (`prev` is what it said), the drawing starts as the old
 * bubble and then the old words are deleted letter by letter, the bubble is resized, and the new words are typed: one
 * continuous motion, no pop.
 */
export function speechSvg(text: string, room: number, prev?: string): { source: string; width: number; height: number; lines: number } {
  const to = bubbleLayout(text, room)
  if (prev === undefined || prev === text) {
    const width = to.w + BUBBLE_PAD.x + 6
    const height = to.h + 2 * BUBBLE_PAD.y
    return { source: wrapSvg(width, height, bubbleOut(to.lines, BUBBLE_PAD.x, BUBBLE_PAD.y, to.w)), width, height, lines: to.lines.length }
  }
  const from = bubbleLayout(prev, room)
  const width = Math.max(from.w, to.w) + BUBBLE_PAD.x + 6
  const height = Math.max(from.h, to.h) + 2 * BUBBLE_PAD.y
  const bx = BUBBLE_PAD.x
  const by = BUBBLE_PAD.y
  const D = '#0b0705'
  const G = C.gray
  const chars = (lines: string[]) => Math.max(1, ...lines.map(l => l.length))
  const eraseS = Math.min(0.4, chars(from.lines) * 0.02)
  const resizeS = 0.2
  const typeS = Math.min(0.7, chars(to.lines) * 0.025)
  const t1 = eraseS
  const t2 = eraseS + resizeS
  // A shape of the bubble: its width and height are the bubble's plus a constant, so one animation per attribute resizes it.
  const shape = (x: number, y: number, dw: number, dh: number, fill: string, extra = '') => {
    const w0 = from.w + dw
    const w1 = to.w + dw
    const h0 = from.h + dh
    const h1 = to.h + dh
    const grow = (attr: string, a: number, z: number) => (a === z ? '' : `<animate attributeName="${attr}" from="${a}" to="${z}" begin="${t1}s" dur="${resizeS}s" fill="freeze"/>`)
    return `<rect x="${x}" y="${y}" width="${w0}" height="${h0}" fill="${fill}"${extra}>${grow('width', w0, w1)}${grow('height', h0, h1)}</rect>`
  }
  const shadow = [4, 3, 2, 1].map(g => shape(bx + 2 - g, by - g, -4 + 2 * g, 2 * g, '#000', ' fill-opacity="0.07"') + shape(bx - g, by + 2 - g, 2 * g, -4 + 2 * g, '#000', ' fill-opacity="0.07"')).join('')
  const body = [
    shape(bx + 2, by, -4, 0, D), shape(bx, by + 2, 0, -4, D),
    shape(bx + 4, by + 2, -8, -4, G), shape(bx + 2, by + 4, -4, -8, G),
  ].join('')
  const r = (x: number, y: number, rw: number, rh: number, c: string) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${c}"/>`
  const tail = [
    r(bx, by + 10, 2, 6, G),
    r(bx - 2, by + 8, 2, 10, D), r(bx - 2, by + 10, 2, 6, G),
    r(bx - 4, by + 10, 2, 6, D), r(bx - 4, by + 12, 2, 2, G),
    r(bx - 6, by + 12, 2, 2, D),
  ].join('')
  const textLines = (lines: string[], h: number) => {
    const top = by + Math.round((h - lines.length * BUBBLE_LINE) / 2) + 11
    return lines.map((l, i) => `<text x="${bx + TEXT_X}" y="${top + i * BUBBLE_LINE}" font-size="${BUBBLE_SIZE}" font-weight="400" fill="#1b1a19">${esc(l)}</text>`).join('')
  }
  // A clip that opens (or closes) in whole letters: the words appear (or go) as typed.
  const steps = (lines: string[], widthPx: number, opening: boolean, begin: number, dur: number) => {
    const n = Math.min(40, chars(lines))
    const ws = Array.from({ length: n + 1 }, (_, i) => Math.round((widthPx * (opening ? i : n - i)) / n))
    const times = Array.from({ length: n + 1 }, (_, i) => (i / n).toFixed(3))
    return `<animate attributeName="width" values="${ws.join(';')}" keyTimes="${times.join(';')}" calcMode="discrete" begin="${begin}s" dur="${dur}s" fill="freeze"/>`
  }
  const fromPx = Math.ceil(Math.max(...from.lines.map(l => estimate(l, BUBBLE_SIZE)))) + 4
  const toPx = Math.ceil(Math.max(...to.lines.map(l => estimate(l, BUBBLE_SIZE)))) + 4
  const defs = `<defs><clipPath id="cko"><rect x="${bx + TEXT_X - 1}" y="0" width="${fromPx}" height="${height}">${steps(from.lines, fromPx, false, 0, eraseS)}</rect></clipPath><clipPath id="ckn"><rect x="${bx + TEXT_X - 1}" y="0" width="0" height="${height}">${steps(to.lines, toPx, true, t2, typeS)}</rect></clipPath></defs>`
  const out = `${defs}${shadow}${body}${tail}<g clip-path="url(#cko)">${textLines(from.lines, from.h)}</g><g clip-path="url(#ckn)">${textLines(to.lines, to.h)}</g>`
  return { source: wrapSvg(width, height, out), width, height, lines: to.lines.length }
}

/** The mascot, the meters and the gap between them as separate drawings: a new pose replaces only Clawd, so the meters are never reloaded (a replaced drawing blinks). */
export function bandParts(width: number, m: Model, mascot: { markup: string; width: number; height: number }): {
  mascot: { source: string; width: number; height: number } | null
  meters: { source: string; width: number; height: number }
} {
  const gap = mascot.width > 0 ? 12 : 0
  const bodyW = Math.max(200, width - mascot.width - gap)
  const body = bandBody(bodyW, m)
  const height = Math.max(MIN_ROW, body.height + 2)
  const top = Math.max(0, Math.round((height - body.height) / 2) - 3)
  return {
    mascot: mascot.width > 0 ? { source: wrapSvg(mascot.width, mascot.height, mascot.markup), width: mascot.width, height: mascot.height } : null,
    meters: { source: wrapSvg(bodyW, height, `<g transform="translate(0 ${top})">${body.out}</g>`), width: bodyW, height },
  }
}

/** One slim band: the meters side by side, a few lines tall. */
export function bandBody(width: number, m: Model): { out: string; height: number } {
  // Narrow windows get short labels and a smaller size; the numbers are the same.
  const narrow = width < 480
  const size = narrow ? 10 : 11
  const labels = narrow ? ['Ctx', '5h', 'Week', 'Cache'] : ['Context', '5-hour', 'Weekly', 'Cache']
  const room = (i: number, w: number) => w - estimate(labels[i] ?? '', size) - 8
  // Context and Weekly carry the most text (a warning, the pace); 5-hour the least.
  const weights = m.cache ? [1.15, 0.9, 1.3, 0.95] : [1, 1, 1]
  const gap = narrow ? 14 : 22
  const usable = width - (weights.length - 1) * gap
  const total = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map(w => Math.floor((usable * w) / total))
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b + gap, 0))
  const [x0 = 0, x1 = 0, x2 = 0, x3 = 0] = xs
  const [w0 = 0, w1 = 0, w2 = 0, w3 = 0] = widths
  let out = ''

  // Context: label, percent and bar. The warning is the bubble's to say, so the row never grows for it.
  out += text(x0, 11, labels[0] ?? '', { size })
  out += parts(x0 + w0, 11, fit(m.ctx.value, room(0, w0), size), { anchor: 'end' })
  out += rect(x0, 17, w0, 7, C.gray, TRACK)
  if (m.ctx.percent > 0) out += rect(x0, 17, Math.max(7, (w0 * clamp(m.ctx.percent, 0, 100)) / 100), 7, m.ctx.color)
  const height = 45

  // 5-hour: always says when it resets
  out += text(x1, 11, labels[1] ?? '', { size })
  out += parts(x1 + w1, 11, fit(m.five.value, room(1, w1), size), { anchor: 'end' })
  out += rect(x1, 17, w1, 7, C.gray, TRACK)
  if (m.five.used > 0) out += rect(x1, 17, Math.max(7, (w1 * clamp(m.five.used, 0, 100)) / 100), 7, m.five.color)
  out += text(x1, 38, clip(estimate(m.five.sub, LEGEND_SIZE) <= w1 ? m.five.sub : m.five.subShort, w1, LEGEND_SIZE), { size: LEGEND_SIZE })

  // Weekly: usage and the difference to today's allowance, five slots, a day letter under each
  out += text(x2, 11, labels[2] ?? '', { size })
  out += parts(x2 + w2, 11, fit(m.week.value, room(2, w2), size), { anchor: 'end' })
  const slotGap = 4
  const slotW = (w2 - 4 * slotGap) / 5
  DAYS.forEach((letter, i) => {
    const sx = x2 + i * (slotW + slotGap)
    out += rect(sx, 17, slotW, 7, C.gray, TRACK)
    const f = sliceFrac(m.week.used, i)
    if (f > 0) out += rect(sx, 17, Math.max(7, slotW * f), 7, m.week.color)
    if (narrow) return
    out += text(sx + slotW / 2, 38, letter, {
      size: LEGEND_SIZE,
      anchor: 'middle',
      fill: i === m.week.today ? C.blue : C.gray,
      weight: i === m.week.today ? 700 : 400,
    })
  })

  if (narrow) out += text(x2, 38, clip(m.week.paceText, w2, LEGEND_SIZE), { size: LEGEND_SIZE, fill: m.week.paceColor })

  // Prompt cache: a bar that drains; what the next message costs only when it is about to go cold
  if (m.cache) {
    const c = m.cache
    out += text(x3, 11, labels[3] ?? '', { size })
    out += parts(x3 + w3, 11, fit(c.value, room(3, w3), size), { anchor: 'end' })
    out += rect(x3, 17, w3, 7, C.gray, TRACK)
    if (c.view.frac > 0) out += rect(x3, 17, Math.max(7, w3 * c.view.frac), 7, c.color)
    if (c.near) {
      const sub = estimate(c.sub, LEGEND_SIZE) <= w3 ? c.sub : c.subShort
      out += text(x3, 38, clip(sub, w3, LEGEND_SIZE), { size: LEGEND_SIZE, fill: c.view.state === 'soon' || c.view.state === 'cold' ? C.orange : C.gray })
    }
  }

  return { out, height }
}

export function bandSvg(width: number, m: Model): { source: string; width: number; height: number } {
  const { out, height } = bandBody(width, m)
  return { source: wrapSvg(width, height, out), width, height }
}

/** The shortest the row gets, so the small mascot or none still leaves room for a label, a bar and a value. */
export const MIN_ROW = 46

/** The whole cockpit drawing: the mascot on the left (if any), the meters beside it, always the same height. */
export function cockpitSvg(width: number, m: Model, mascot: { markup: string; width: number; height: number }): { source: string; width: number; height: number } {
  const gap = mascot.width > 0 ? 12 : 0
  const bodyW = Math.max(200, width - mascot.width - gap)
  const body = bandBody(bodyW, m)
  const height = Math.max(mascot.height, MIN_ROW, body.height + 2)
  const top = Math.max(0, Math.round((height - body.height) / 2) - 3)
  const mascotY = Math.round((height - mascot.height) / 2)
  const out = `<g transform="translate(0 ${mascotY})">${mascot.markup}</g><g transform="translate(${mascot.width + gap} ${top})">${body.out}</g>`
  return { source: wrapSvg(mascot.width + gap + bodyW, height, out), width: mascot.width + gap + bodyW, height }
}

/** A hairline with room above and below it, to set one band apart from the next. */
export function dividerSvg(width: number): { source: string; width: number; height: number } {
  const height = 15
  return { source: wrapSvg(width, height, rect(0, 7, width, 1, C.gray, 0.45)), width, height }
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


// ---------- what needs you ----------

/** 0 nothing, 1 a warning, 2 an alert. Opens the band by itself; the arrow can still collapse it. */
export function attentionOf(m: Model, hasAdvice: boolean, now: number): 0 | 1 | 2 {
  if (m.ctx.level === 'alert' || m.five.used >= 100) return 2
  if (m.ctx.level === 'warn' || m.five.used >= 80 || m.week.used > allottedThrough(now) || m.cache?.view.state === 'soon' || m.cache?.view.state === 'cold' || hasAdvice) return 1
  return 0
}

export type ActionId = 'handoff' | 'copy' | 'fresh' | 'saverOn' | 'compact'
export type Alert = { id: string; tone: Level; text: string; actions: ActionId[] }

/**
 * Every warning with the action that answers it. A warning that has no action to offer is left out: the
 * meters' colors still show it.
 */
export function alertsOf(m: Model, o: { saverOn: boolean; now: number }): Alert[] {
  const out: Alert[] = []
  if (m.ctx.level === 'alert') out.push({ id: 'ctx', tone: 'alert', text: m.ctx.legend.text, actions: ['handoff', 'compact', 'copy', 'fresh'] })
  else if (m.ctx.level === 'warn') out.push({ id: 'ctx', tone: 'warn', text: m.ctx.legend.text, actions: ['handoff', 'compact', 'copy', 'fresh'] })
  const c = m.cache?.view
  if (c?.state === 'soon') out.push({ id: 'cache', tone: 'warn', text: `Prompt cache goes cold in ${c.label}. ${m.cache?.sub ?? ''}`.trim(), actions: ['handoff'] })
  if (c?.state === 'cold') out.push({ id: 'cache', tone: 'warn', text: `Prompt cache is cold: the next message pays full price. ${m.cache?.sub ?? ''}`.trim(), actions: ['handoff'] })
  if (m.five.used >= 100) out.push({ id: 'five', tone: 'alert', text: `5-hour limit reached. ${m.five.sub}`.trim(), actions: ['copy'] })
  else if (m.five.used >= 80 && !o.saverOn) out.push({ id: 'five', tone: 'warn', text: `${pct(m.five.used)} of the 5-hour limit used. ${m.five.sub}`.trim(), actions: ['saverOn'] })
  if (m.week.used > allottedThrough(o.now) && !o.saverOn) out.push({ id: 'week', tone: 'warn', text: `Weekly limit ${m.week.paceText}.`, actions: ['saverOn'] })
  return out
}
