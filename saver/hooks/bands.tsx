// Stacking contract for every mod that draws in the band above the prompt.
//
// Each mod calls `next(e)` first, wraps its own tree in a Box keyed `band:<rank>:<name>`, and returns
// `stack(below, mine, Box)`. The result is one Box keyed `bands` whose children are sorted by rank, so the
// order on screen is the same whichever mod the engine happens to call first. A tree from a mod that
// follows no contract has rank 0 and stays on top, in the order it came.
//
// Keep this file identical in meters, saver, plan-progress and prompt-enhancer (a mod may only import
// from its own folder).
export type Tree = { type: string; props?: Record<string, unknown>; children?: unknown[] }

export const RANK = { 'plan-progress': 10, meters: 20, saver: 30, 'prompt-enhancer': 40 } as const

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

/** Whether a band of lower rank (drawn higher up) is present, so a divider has something to divide from. */
export const hasAbove = (below: Tree, rank: number): boolean => bandsOf(below).some(b => rankOf(b) < rank)

export function stack(below: Tree, mine: Tree, Box: unknown): never {
  const all = [...bandsOf(below), mine]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rankOf(a.t) - rankOf(b.t) || a.i - b.i)
    .map(x => x.t)
  if (all.length === 1) return mine as never
  return h(Box as never, { key: 'bands', flexDirection: 'column' } as never, ...(all as never[])) as never
}
