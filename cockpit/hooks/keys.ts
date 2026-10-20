// Hotkey chords typed in the prompt box, e.g. "meta+h" or "ctrl+shift+k".
export type Chord = { key: string; ctrl: boolean; meta: boolean; shift: boolean }
export type KeyLike = { key: string; ctrl?: true; meta?: true; shift?: true }

const MODS = new Set(['ctrl', 'control', 'meta', 'alt', 'option', 'opt', 'cmd', 'shift'])

/** Empty or malformed -> undefined (the hotkey is off). A bare letter is refused: it would eat typing. */
export function parseChord(spec: string): Chord | undefined {
  const parts = spec.toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  const key = parts.filter(p => !MODS.has(p))
  if (parts.length === 0 || key.length !== 1 || key[0] === undefined) return undefined
  const has = (...names: string[]) => parts.some(p => names.includes(p))
  const chord: Chord = { key: key[0], ctrl: has('ctrl', 'control'), meta: has('meta', 'alt', 'option', 'opt', 'cmd'), shift: has('shift') }
  return chord.ctrl || chord.meta ? chord : undefined
}

export function matchesChord(chord: Chord | undefined, k: KeyLike | undefined): boolean {
  if (!chord || !k) return false
  return k.key.toLowerCase() === chord.key && !!k.ctrl === chord.ctrl && !!k.meta === chord.meta && !!k.shift === chord.shift
}
