// The desktop drawing of the plan panel: the same palette and bar style as the meters band.
import type { PlanPhase, PlanTask } from '../types'
import { PHASES, clip, firstLine } from './logic'

export type PlanView = {
  goal: string
  phase: PlanPhase
  isDone: boolean
  isRunning: boolean
  pct: number
  done: number
  total: number
  elapsed: string
  shown: readonly PlanTask[]
  hidden: number
}

const C = { blue: '#0A84FF', green: '#30D158', gray: '#8E8E93', text: '#D1D1D6' }
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
const EST = 0.54 // average glyph width as a share of the font size, as in the meters band
const ROW = 15

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const room = (text: string, size: number) => text.length * size * EST
const fits = (text: string, px: number, size: number) => clip(text, Math.max(4, Math.floor(px / (size * EST))))

const rect = (x: number, y: number, w: number, h: number, fill: string, opacity = 1, r = 3.5) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(r, h / 2, Math.max(0, w) / 2).toFixed(1)}" fill="${fill}" fill-opacity="${opacity}"/>`

const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string; deco?: string } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y}" font-size="${o.size ?? 11}" font-weight="${o.weight ?? 400}" text-anchor="${o.anchor ?? 'start'}" fill="${o.fill ?? C.gray}"${o.deco ? ` text-decoration="${o.deco}"` : ''}>${esc(s)}</text>`

export function planSvg(width: number, v: PlanView): { source: string; width: number; height: number } {
  let out = ''

  // Goal
  out += text(0, 11, 'Goal', { size: 10 })
  out += text(34, 11, fits(v.goal || 'working…', width - 34, 11.5), { size: 11.5, weight: 600, fill: C.text })

  // Phase: five chips, the current one lit; all green when the list is done; dimmer while idle
  const chip = (label: string) => room(label, 10) + 16
  const total = PHASES.reduce((a, p) => a + chip(p) + 6, -6)
  const labels = total <= width ? PHASES : ([v.phase] as readonly PlanPhase[])
  let x = 0
  for (const p of labels) {
    const w = chip(p)
    const isCurrent = p === v.phase
    const fill = v.isDone ? C.green : isCurrent ? C.blue : C.gray
    out += rect(x, 20, w, 16, fill, v.isDone ? 0.25 : isCurrent ? (v.isRunning ? 1 : 0.55) : 0.18, 8)
    out += text(x + w / 2, 31.5, p, { size: 10, anchor: 'middle', weight: isCurrent ? 600 : 400, fill: v.isDone ? C.green : isCurrent ? '#FFFFFF' : C.gray })
    x += w + 6
  }
  if (v.isDone) out += text(x + 4, 31.5, '✔ complete', { size: 10.5, fill: C.green, weight: 600 })
  else if (!v.isRunning) out += text(x + 4, 31.5, 'idle', { size: 10.5 })

  // Bar, percent, steps, time
  const right = v.total > 0 ? `${v.pct}% · ${v.done}/${v.total} steps · ${v.elapsed}` : `no task list yet · ${v.elapsed}`
  const barW = Math.max(60, width - room(right, 10.5) - 14)
  out += rect(0, 45, barW, 7, C.gray, 0.25)
  if (v.pct > 0) out += rect(0, 45, Math.max(7, (barW * Math.min(100, v.pct)) / 100), 7, v.isDone ? C.green : C.blue)
  out += text(width, 52, right, { size: 10.5, anchor: 'end' })

  // Checklist
  let y = 70
  for (const t of v.shown) {
    const glyph = t.status === 'completed' ? '✔' : t.status === 'in_progress' ? '◐' : '○'
    const color = t.status === 'completed' ? C.green : t.status === 'in_progress' ? C.blue : C.gray
    out += text(0, y, glyph, { size: 11, fill: color })
    out += text(16, y, fits(firstLine(t.subject), width - 16, 11), {
      size: 11,
      fill: t.status === 'in_progress' ? C.text : C.gray,
      weight: t.status === 'in_progress' ? 600 : 400,
      deco: t.status === 'completed' ? 'line-through' : undefined,
    })
    y += ROW
  }
  if (v.hidden > 0) {
    out += text(16, y, `+${v.hidden} more`, { size: 10 })
    y += ROW
  }

  const height = Math.round((v.shown.length > 0 || v.hidden > 0 ? y - 4 : 60) + 4)
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${out}</svg>`,
    width,
    height,
  }
}
