// Clawd, drawn by code on his 12 x 8 cell grid (a cell is 2 x 2 pixels, the canvas 34 x 28, shown at 2x).
// Source and every planned state: docs/mascot/clawd-sheet.html. This first version draws only the idle loop,
// to prove the animation plays in the desktop app; the other states come in the next pull request.
// The character belongs to Anthropic: personal use only (docs/MASCOT.md).

export const MASCOT = { width: 68, height: 56 } as const

const ART = ['..########..', '..#O####O#..', '############', '############', '..########..', '..########..', '..#.#..#.#..', '..#.#..#.#..'] as const
const BODY = '#DA7758'
const SHADE = '#b5593d'
const EYE = '#0b0705'
const OX = 5
const OY = 8

type Frame = { dy: number; eyes: 'open' | 'blink' }

const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

/** One frame of Clawd as rect markup in sprite pixels (34 x 28). */
export function frameMarkup(f: Frame): string {
  let out = ''
  ART.forEach((row, cy) => {
    for (let cx = 0; cx < row.length; cx++) {
      if (row[cx] === '.') continue
      const isLeg = cy >= 6
      out += rect(OX + cx * 2, OY + cy * 2 + (isLeg ? 0 : f.dy), 2, 2, BODY)
    }
  })
  out += rect(OX + 4, OY + 10 + f.dy, 16, 1, SHADE)
  const ey = OY + 2 + f.dy
  if (f.eyes === 'open') out += rect(OX + 6, ey, 2, 2, EYE) + rect(OX + 16, ey, 2, 2, EYE)
  else out += rect(OX + 6, ey + 1, 2, 1, EYE) + rect(OX + 16, ey + 1, 2, 1, EYE)
  return out
}

const IDLE: Frame[] = [
  { dy: 0, eyes: 'open' },
  { dy: 1, eyes: 'open' },
  { dy: 0, eyes: 'open' },
  { dy: 1, eyes: 'open' },
  { dy: 0, eyes: 'open' },
  { dy: 0, eyes: 'blink' },
]

/** Frames swapped by SMIL (a sandboxed Svg with isInteractive plays it; elsewhere the first frame shows). */
export function idleMarkup(): string {
  const n = IDLE.length
  const keyTimes = IDLE.map((_, i) => (i / n).toFixed(4)).join(';')
  const dur = (n * 0.45).toFixed(2)
  const groups = IDLE.map((f, i) => {
    const values = IDLE.map((_, j) => (j === i ? 1 : 0)).join(';')
    return `<g opacity="${i === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>${frameMarkup(f)}</g>`
  }).join('')
  return `<g transform="scale(2)">${groups}</g>`
}
