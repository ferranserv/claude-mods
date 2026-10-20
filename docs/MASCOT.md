# Mascot: Clawd (PR 2)

Source: `docs/mascot/clawd-sheet.html` (browsable, animated, drawn by code on Clawd's 12 x 8 cell grid, cell = 2 x 2 px, body #DA7758). Scenario ideas inspired by the owner's reference sheet (Getillustrations.com, not copied). No official sprite pack exists; grid and color come from the MIT-licensed ClawdMoji, whose notice says the character belongs to Anthropic. Frames are original code, not copied GIFs. Personal use only: check Anthropic's brand terms before publishing.

## States (signal -> state), 30 in the sheet
Cockpit signals
- idle: beach lounge, sunglasses, drink with umbrella (calm)
- typing (turn running) | thinking: loading circle, no question mark (waiting on model)
- bell: big bell, shake lines, music notes (turn finished, 4 s, chime plays)
- coins (saver routed) | walk (session start, 6 s) | talk (a bubble with an action is up)
- uneasy: forehead sweat, wipes with handkerchief (context >= 50%)
- on fire: flames, sweat, handkerchief in one hand, waving the other (context >= 80%)
- hourglass: big, held under his hand, sweat, handkerchief (cache <= 5 min)
- frozen: icy blue, no movement, wide ice slab over his feet (cache cold)
- gauge low (allowance within 2%) | mad (over allowance)
- sleepy (5h >= 80%) | asleep: in bed, eye mask, Zs, alarm clock showing the wake-up time (5h reached; canvas 56 wide)
- love (handoff saved, 5 s) | detective: fedora, magnifying glass (preflight finding) | oops (tool failed)
- wizard: wizard hat and wand (draft enhanced)
Tool and session scenarios (added by Claude; owner pre-approved)
- hello (first message) | idea: lightbulb (plan ready) | coffee break (turn over 2 min) | reading: glasses and scroll (Read, Grep, Glob) | building: hard hat and wrench (Edit, Write) | browsing: browser window (WebSearch, WebFetch) | unplugged (MCP or network down) | dizzy: swirl (compacting) | flex (tests passed) | reviewed: glasses and check (review clean) | needs your approval: raised hand (permission prompt)

## Priority (highest wins; transient states play once, then fall back)
oops > mad > asleep > on fire > frozen > unplugged > detective > needs approval > gauge low > hourglass > uneasy > sleepy > dizzy > bell / love / wizard / coins / walk / hello (transient) > building / reading / browsing / typing / coffee / thinking > talk > idle.
While a turn runs the cache is warm, so cache states do not apply; tool states win over idle.

## Canvas and bubble
Canvas 34 x 28 px (asleep: 56 x 28), drawn at 2x (68 x 56). Every state is checked by the sheet for pixels outside the canvas (red tag, none now). The speech bubble sits right of him with a tail, wraps text (long text and narrow widths tested), and carries the action button for that warning.

## Rendering
SVG per frame set, frames swapped by SMIL (`animate` on opacity, `isInteractive: true`). Speech bubble beside him, text from the active warning, its action button next to it. Terminal surface (no SVG): one-line text face. `prefers-reduced-motion`: first frame only. No model calls; redraw only when the state changes.

## Open questions
- SMIL on the desktop app (Batch 0 of PR 1).
- Band height with the mascot (see COCKPIT.md risk 3).
