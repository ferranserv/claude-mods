// Stacking for the band above the prompt. The cockpit draws one tree keyed `band:<rank>:cockpit` and
// returns `stack(below, mine, Box)`, so a tree another plugin or the app drew beneath it stays on top,
// in the order it came, and the cockpit sits under it.
export type Tree = { type: string; props?: Record<string, unknown>; children?: unknown[] }

export const RANK = { cockpit: 10 } as const

export const bandKey = (name: keyof typeof RANK) => `band:${RANK[name]}:${name}`

const rankOf = (t: Tree): number => {
  const m = /^band:(\d+):/.exec(String(t.props?.key ?? ''))
  return m ? Number(m[1]) : 0
}

/** The bands already drawn beneath this one, one tree each. */
export function bandsOf(below: Tree): Tree[] {
  if (below.type === 'engine') return []
  if (below.type === 'Box' && below.props?.key === 'bands') return (below.children ?? []) as Tree[]
  return [below]
}

export function stack(below: Tree, mine: Tree | Tree[], Box: unknown): never {
  const own = Array.isArray(mine) ? mine : [mine]
  const all = [...bandsOf(below), ...own]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rankOf(a.t) - rankOf(b.t) || a.i - b.i)
    .map(x => x.t)
  if (all.length === 1) return all[0] as never
  return h(Box as never, { key: 'bands', flexDirection: 'column' } as never, ...(all as never[])) as never
}
