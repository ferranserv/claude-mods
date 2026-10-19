// Stacking contract for every mod that draws in the band above the prompt.
//
// Each mod calls `next(e)` first, wraps its own tree in a Box keyed `band:<rank>:<name>`, and returns
// `stack(below, mine, Box)` (`mine` may be a list when a mod draws more than one band). The result is one
// Box keyed `bands` whose children are sorted by rank, so the order on screen is the same whichever mod
// the engine happens to call first. A tree from a mod that follows no contract has rank 0 and stays on
// top, in the order it came.
//
// Keep this file identical in meters, saver, plan-progress and prompt-enhancer (a mod may only import
// from its own folder).
export type Tree = { type: string; props?: Record<string, unknown>; children?: unknown[] }

// 'saver-rule' is saver's divider: its own band between meters and saver, so it lands there whichever of
// the two the engine calls first (a mod cannot see bands that are drawn by a mod called after it).
export const RANK = { 'plan-progress': 10, meters: 20, 'saver-rule': 25, saver: 30, 'prompt-enhancer': 40 } as const

export const bandKey = (name: keyof typeof RANK) => `band:${RANK[name]}:${name}`

const rankOf = (t: Tree): number => {
  const m = /^band:(\d+):/.exec(String(t.props?.key ?? ''))
  return m ? Number(m[1]) : 0
}

/** The bands already drawn beneath this mod, one tree each. */
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
