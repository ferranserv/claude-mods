// Pure drawing code: the model of what to show, and the SVG and text it is drawn with.

export type Fill = { tokens: number; window: number; percent: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Data = { fill: Fill | null; limits: Limit[]; now: number }

export const RED_PAST = 80
// A window can be 1M, so percent alone says "fine" long after every message
// has become expensive: this is where the legend starts to suggest a fresh session.
export const LARGE_TOKENS = 150_000

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

export type Legend = { tone: 'calm' | 'warn' | 'alert'; text: string }

/** The legend under the context meter: when a fresh session is worth starting. */
export function legendFor(percent: number, tokens: number): Legend {
  if (percent > RED_PAST) {
    return { tone: 'alert', text: 'Nearly full. Start a fresh session (/clear) to save tokens.' }
  }
  if (tokens >= LARGE_TOKENS) {
    return {
      tone: 'warn',
      text: `Large context: every message re-reads ${kilo(tokens)}. A fresh session costs less.`,
    }
  }
  return {
    tone: 'calm',
    text: `Fresh session advised past ${RED_PAST}% or ${kilo(LARGE_TOKENS)} tokens.`,
  }
}

const toneColor = (t: Legend['tone']) => (t === 'alert' ? C.red : t === 'warn' ? C.orange : C.gray)

// ---------- the model ----------

/** Text drawn in one or more colors; the options of a value go longest first. */
export type Parts = { t: string; fill: string }[]

export type Model = {
  ctx: { percent: number; color: string; value: Parts[]; legend: Legend }
  five: { used: number; color: string; value: Parts[]; sub: string }
  week: {
    used: number
    color: string
    today: number
    value: Parts[]
    paceText: string
    paceColor: string
  }
}

export function model(d: Data): Model {
  const g = (t: string, fill = C.gray) => [{ t, fill }]

  const percent = d.fill?.percent ?? 0
  const tokens = d.fill?.tokens ?? 0
  const legend = legendFor(percent, tokens)
  const ctx = {
    percent,
    color: percent > RED_PAST ? C.red : C.blue,
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

  return { ctx, five, week }
}

export function altText(m: Model): string {
  return `Context ${pct(m.ctx.percent)} full, 5-hour limit ${pct(m.five.used)} used, weekly limit ${pct(m.week.used)} used (${m.week.paceText})`
}

// ---------- SVG ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const estimate = (s: string, size: number) => s.length * size * 0.6

const joined = (p: Parts) => p.map(x => x.t).join('')

/** The longest option that fits `room` px; else the last one, clipped. */
function fit(options: Parts[], room: number, size: number): Parts {
  for (const o of options) if (estimate(joined(o), size) <= room) return o
  const last = options[options.length - 1] ?? []
  const max = Math.max(1, Math.floor(room / (size * 0.6)))
  const text = joined(last)
  return text.length <= max ? last : [{ t: text.slice(0, max - 1) + '…', fill: last[0]?.fill ?? C.gray }]
}

function clip(text: string, room: number, size: number): string {
  const max = Math.max(1, Math.floor(room / (size * 0.6)))
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
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

export function bandWidth(columns: number): number {
  return clamp(Math.round(columns * 7), 300, 980)
}

/** One slim band: three meters side by side, a few lines tall. */
export function bandSvg(width: number, m: Model): { source: string; width: number; height: number } {
  const gap = 28
  const gw = Math.floor((width - 2 * gap) / 3)
  const height = 46
  let out = ''

  const x0 = 0
  const x1 = gw + gap
  const x2 = 2 * (gw + gap)

  // Context
  out += text(x0, 11, 'Context', { size: 11 })
  out += parts(x0 + gw, 11, fit(m.ctx.value, gw - 52, 11), { anchor: 'end' })
  out += rect(x0, 17, gw, 7, C.gray, TRACK)
  if (m.ctx.percent > 0) out += rect(x0, 17, Math.max(7, (gw * clamp(m.ctx.percent, 0, 100)) / 100), 7, m.ctx.color)
  out += text(x0, 40, clip(m.ctx.legend.text, gw, 10), {
    size: 10,
    fill: toneColor(m.ctx.legend.tone),
  })

  // 5-hour
  out += text(x1, 11, '5-hour', { size: 11 })
  out += parts(x1 + gw, 11, fit(m.five.value, gw - 46, 11), { anchor: 'end' })
  out += rect(x1, 17, gw, 7, C.gray, TRACK)
  if (m.five.used > 0) out += rect(x1, 17, Math.max(7, (gw * clamp(m.five.used, 0, 100)) / 100), 7, m.five.color)
  out += text(x1, 40, clip(m.five.sub, gw, 10), { size: 10 })

  // Weekly: five slots with a clear gap between them, a day letter centered under each
  out += text(x2, 11, 'Weekly', { size: 11 })
  out += parts(x2 + gw, 11, fit(m.week.value, gw - 46, 11), { anchor: 'end' })
  const slotGap = 4
  const slotW = (gw - 4 * slotGap) / 5
  DAYS.forEach((letter, i) => {
    const sx = x2 + i * (slotW + slotGap)
    out += rect(sx, 17, slotW, 7, C.gray, TRACK)
    const f = sliceFrac(m.week.used, i)
    if (f > 0) out += rect(sx, 17, Math.max(7, slotW * f), 7, m.week.color)
    out += text(sx + slotW / 2, 40, letter, {
      size: 10,
      anchor: 'middle',
      fill: i === m.week.today ? C.blue : C.gray,
      weight: i === m.week.today ? 700 : 400,
    })
  })

  return { source: wrapSvg(width, height, out), width, height }
}

export function sideWidth(columns: number): number {
  return clamp(Math.round(columns * 7), 150, 220)
}

/** A vertical panel: bars rise from the bottom; the week is five stacked slots, Monday lowest. */
export function sideSvg(width: number, m: Model): { source: string; width: number; height: number } {
  const w = Math.max(168, width)
  const top = 22
  const barH = 136
  const barW = 16
  const cx = [Math.round(w * 0.16), Math.round(w * 0.46), Math.round(w * 0.74)]
  const bottom = top + barH
  const height = 232
  let out = ''

  const column = (x: number, label: string, value: string, valueFill: string) => {
    out += text(x, 12, value, { size: 11, anchor: 'middle', fill: valueFill, weight: 600 })
    out += text(x, bottom + 15, label, { size: 10, anchor: 'middle' })
  }

  // Context
  column(cx[0] ?? 0, 'Context', pct(m.ctx.percent), m.ctx.percent > RED_PAST ? C.red : C.gray)
  out += rect((cx[0] ?? 0) - barW / 2, top, barW, barH, C.gray, TRACK)
  if (m.ctx.percent > 0) {
    const h = Math.max(barW, (barH * clamp(m.ctx.percent, 0, 100)) / 100)
    out += rect((cx[0] ?? 0) - barW / 2, bottom - h, barW, h, m.ctx.color)
  }

  // 5-hour
  column(cx[1] ?? 0, '5-hour', pct(m.five.used), C.gray)
  out += rect((cx[1] ?? 0) - barW / 2, top, barW, barH, C.gray, TRACK)
  if (m.five.used > 0) {
    const h = Math.max(barW, (barH * clamp(m.five.used, 0, 100)) / 100)
    out += rect((cx[1] ?? 0) - barW / 2, bottom - h, barW, h, m.five.color)
  }
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

  // The legend: two short lines under everything
  const words = m.ctx.legend.text.split(' ')
  const lines: string[] = ['']
  const perLine = Math.floor((w - 8) / (9 * 0.6))
  for (const word of words) {
    const cur = lines[lines.length - 1] ?? ''
    if ((cur + ' ' + word).trim().length <= perLine) lines[lines.length - 1] = (cur + ' ' + word).trim()
    else lines.push(word)
  }
  lines.slice(0, 2).forEach((line, i) => {
    out += text(w / 2, bottom + 46 + i * 12, line, {
      size: 9,
      anchor: 'middle',
      fill: toneColor(m.ctx.legend.tone),
    })
  })

  return { source: wrapSvg(w, height, out), width: w, height }
}

// ---------- terminal fallback: one short line of text ----------

export type Segment = { t: string; fill: string }

export function cells(percent: number, width: number): number {
  const p = clamp(percent, 0, 100)
  if (p === 0) return 0
  return Math.max(1, Math.round((p / 100) * width))
}

export function line(m: Model, bar = 8): Segment[] {
  const out: Segment[] = []
  const meter = (label: string, percent: number, color: string, tail = '') => {
    const n = cells(percent, bar)
    out.push({ t: `${label} `, fill: C.gray })
    if (n > 0) out.push({ t: '━'.repeat(n), fill: color })
    out.push({ t: '━'.repeat(bar - n), fill: '#636366' })
    out.push({ t: ` ${pct(percent)}${tail}`, fill: C.gray })
  }
  meter('Context', m.ctx.percent, m.ctx.color)
  out.push({ t: '   ', fill: C.gray })
  meter('5h', m.five.used, m.five.color)
  out.push({ t: '   ', fill: C.gray })
  meter('Week', m.week.used, m.week.color)
  out.push({ t: ` ${m.week.paceText}`, fill: m.week.paceColor })
  if (m.ctx.legend.tone !== 'calm') {
    const short = m.ctx.legend.tone === 'alert' ? 'start a fresh session' : 'long context'
    out.push({ t: `   ${short}`, fill: toneColor(m.ctx.legend.tone) })
  }
  return out
}
