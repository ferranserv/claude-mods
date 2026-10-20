# Mascot: Clawd (PR 2)

Source: `docs/mascot/clawd-sheet.html` (browsable, animated, drawn by code on Clawd's 12 x 8 cell grid, cell = 2 x 2 px, canvas 30 x 24, shown at 2x = 60 x 48 px, body #DA7758). No official sprite pack exists; grid and color come from the MIT-licensed ClawdMoji, whose notice says the character belongs to Anthropic. Frames are original code, not copied GIFs. Personal use only: check Anthropic's brand terms before publishing.

## States (cockpit signal -> state)
idle (calm) | typing (turn running) | thinking (waiting on model) | bell (turn finished, 4 s, plays chime) | shades (saver routed) | walk (session start, 6 s) | talk (a bubble with an action is up) | uneasy (context >= 50%) | on fire (context >= 80%) | hourglass (cache <= 5 min) | frozen (cache cold) | gauge low (allowance within 2%) | mad (over allowance) | sleepy (5h >= 80%) | asleep (5h reached) | love (handoff saved, 5 s) | detective (preflight finding) | oops (tool failed) | wand (draft enhanced).

## Priority (highest wins; transient states play once, then fall back)
oops > mad > asleep > on fire > frozen > detective > gauge low > hourglass > uneasy > sleepy > bell / love / wand / shades / walk (transient) > typing / thinking > talk > idle.
While a turn runs the cache is warm, so cache states do not apply; typing wins over them.

## Rendering
SVG per frame set, frames swapped by SMIL (`animate` on opacity, `isInteractive: true`). Speech bubble beside him, text from the active warning, its action button next to it. Terminal surface (no SVG): one-line text face. `prefers-reduced-motion`: first frame only. No model calls; redraw only when the state changes.

## Open questions
- SMIL on the desktop app (Batch 0 of PR 1).
- Band height with the mascot (see COCKPIT.md risk 3).
