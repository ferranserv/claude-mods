# Mascot: Clawd (PR 2)

Source: `hooks/sprite.ts` (Clawd's 12 x 8 cell grid, cell = 2 x 2 px, body #DA7758). `docs/mascot/clawd-sheet.html` is the browsable, animated sheet, GENERATED from that code (`bun tools/mascot-sheet.ts`; run it after any drawing change, do not edit it by hand). Scenario ideas inspired by the owner's reference sheet (Getillustrations.com, not copied). No official sprite pack exists; grid and color come from the MIT-licensed ClawdMoji, whose notice says the character belongs to Anthropic. Frames are original code, not copied GIFs. Personal use only: check Anthropic's brand terms before publishing.

## States (signal -> state), 30 in the sheet
Cockpit signals
- idle: neutral, sunglasses only, a slow breath (calm). The old beach lounge is archived: `archive/cockpit-idle-beach.md`
- typing (turn running) | thinking: loading circle, no question mark (waiting on model)
- bell: big bell hanging below his raised hand, shake lines, music notes (turn finished, 4 s, chime plays)
- coins (saver routed) | walk (session start, 6 s) | talk (a bubble with an action is up)
- uneasy: darting eyes, trembling, sweat on the forehead, wipes it with a handkerchief (context >= 50%)
- on fire: big flames all around, forehead sweat, both arms waving, no handkerchief (context >= 80%)
- hourglass: classic triangular glass held under his hand, he just watches the sand run, not sad (cache <= 5 min)
- frozen: icy blue, no movement, ice over his feet no wider than him (cache cold)
- gauge low (allowance within 2%) | mad (over allowance)
- sleepy (5h >= 80%): wide awake and yawning, one hand over his mouth, eyes squeezed during the yawn, small Zs | asleep: eye mask, Zs drifting up from his head, collapsed on the alarm clock (no legs) with the wake-up time on it; going to bed, the clock rises and pushes him up, he hops, his legs fold away and he slumps onto it (5h reached; the normal 34 px canvas, so the cockpit does not shift); no bed
- love (handoff saved, 5 s) | detective: fedora, magnifying glass, alert mark beside it (preflight finding) | oops (tool failed)
- wizard: wizard hat and wand (draft enhanced)
Tool and session scenarios (added by Claude; owner pre-approved)
- hello (first message) | idea: floating glowing lightbulb, not touching him (plan ready) | coffee break: coffee visible in the cup, no sparks (turn over 2 min) | reading: glasses and scroll (Read, Grep, Glob) | building: hard hat and hammer (Edit, Write) | browsing: browser window and magnifying glass (WebSearch, WebFetch) | unplugged (MCP or network down) | dizzy: swirl (compacting) | lab: lab coat, bubbling flask, test tubes (tests passed) | reviewed: glasses and check (review clean) | needs your approval: raised hand (permission prompt)

## Hierarchy (0.21.0)
Implemented in `hooks/mood.ts` (header comment), tested in `hooks/mood.test.ts` and `hooks/behavior.test.tsx`. Three levels, so the account's general state never talks over the task:
1. **Needs you now**: hand (permission prompt), writing, idea (a plan waits for approval).
2. **The task, while Claude works**: oops, boom (a check failed), lab (a check passed), ship (a commit, push or PR), plug (events of the task), dizzy (compacting), then creating, building, reading, browse (the tool that runs), then typing or thinking. Coffee comes after 7 minutes of work, shows 6 s every 40 s and goes back to the work. Session events (walk, hello) and the owner's own actions (love, wand) play 5 s when they happen and are not kept.
3. **When the turn is over**: bell, then coins (the saver kept money; deferred from mid-turn to just after the bell), then a notice (talk), then the **status alerts, in turns of 6 s, worst first**: asleep, mad, fire, gauge, sleepy, drunk, cold, hourglass, detective, plug (a connector still down). One alert stays; none left is idle.

While a turn runs no status alert is shown, not even asleep (5-hour limit reached): owner's choice. Their bubbles and buttons go with the pose, so they wait too. A bubble with a button belongs to its pose: when the rotation moves on, the bubble goes with it (the warning stays in the meters). The hold rule (5 s minimum) does not keep an alert on screen once a turn starts.

## Canvas and bubble
Canvas 34 x 28 px, drawn at 2x (68 x 56). Every state is checked by the sheet for pixels outside the canvas (red tag, none now). The speech bubble is drawn in the band at its foot, over the small print and not the meters (so the band never grows), in the cockpit grey with a dark stepped border, a tail to Clawd and a feathered dim behind it; it slides and fades in and out. A bubble with a button stays until you click it or send something else; the others stay about 9 s after their state ends; the raised hand goes the moment you answer.

## Status
Cockpit 0.4.0 ships 30 states (0.2.0 had 29) and the state machine: `hooks/sprite.ts` (drawing, ported from the sheet), `hooks/states.ts` (frames, labels, terminal faces), `hooks/mood.ts` (priority, bubble text). "Reviewed" has no signal in the plugin API and was dropped. Signals: `tool.call` (tool kind, failure, test runs, plans), `tool.check` (a permission ask), `session.compact`, `mcp.connect`, turn and session events, plus the cockpit's own (handoff, enhance, saver).

## Rendering
SVG per frame set, frames swapped by SMIL (`animate` on opacity, `isInteractive: true`). Speech bubble beside him, text from the active warning, its action button next to it. Terminal surface (no SVG): one-line text face. `prefers-reduced-motion`: first frame only. No model calls; redraw only when the state changes.

## Open questions
- SMIL on the desktop app (Batch 0 of PR 1).
- Band height with the mascot (see COCKPIT.md risk 3).

## Drawing rules (owner)
- Never draw floors, ground, water or any scenery that spans the whole canvas: it gets cut off in the band. Adjust the design instead.
- Props are objects near him, inside the canvas.
- The sheet reports any pixel outside the canvas; the count must be zero.


## 0.4.0 changes

- Every state starts from the same neutral pose (props and colours change, not position), so switches look smooth; a switch plays a short one-shot move: hand-drawn for the common pairs (`MOVES` in `states.ts`, 49 of them, each built from the neighbouring states' own first frames), a morph (drop what he holds, pick up the next) for the rest. Every move is staged and eased (`stage` and `smooth`): a prop that goes is lifted in his hand (drawn small, in the hand) and swung out behind him, one that comes is fetched from behind him the same way; then a short first frame, a blink over the prop swap, a small hop, a longer last frame.
- Hold rule: the shown state stays at least 5 s unless a higher-priority one arrives (`HOLD_MS` in `mood.ts`); every fleeting state lasts 5 s or more.
- The bubble is a pixel Svg (white inside, dark stepped border, tail down to Clawd, regular text) in a row above the band, with the action button beside it; `/cockpit bubble float|inline` (inline is a text row under the band).
- Permission asks are debounced 1.5 s (a tool that runs right after was auto-allowed, not an ask); PowerShell counts as a shell for test runs.
- Frozen flakes move; drunk and hourglass start from the neutral pose.
- Meters: collapsed and open are the same drawing; 5-hour shows "Resets at HH:MM (in ...)", weekly "usage % and difference"; context and cache add a subtitle only near their warning. Narrow windows use short labels.

- 0.17.0: `creating` (a curled moustache and no hat, a color palette with four blobs of paint in the left hand, a paintbrush in the right that dips into the palette and strokes the air with the color of each blob); 31 states.
- 0.18.0: `creating` redrawn as a clear painter (handlebar moustache, palette, brush, an easel with a canvas that fills in); `typing` has a concentration mouth (`focus`).
- 0.18.2: hand-drawn moves painter <-> builder and painter <-> typing; the brush and the palette are carried props (small in his hand while put away or fetched).
- 0.19.0: `typing` chews gum and blows pink bubbles (gum 1 to 3, pop 4; mouths `chew` and `chewOpen`); the painter's moustache is two rows clear of the eyes.

- 0.21.0: pose hierarchy (task / needs you / status alerts); alerts hidden while Claude works and rotating when it is over; coffee at 7 min, cycling with the task; idea ranks with the raised hand; coins after the bell; plug stays as an alert while a connector is down.
- 0.22.0: clicking Clawd is ONE Button over his whole square (a label of four blank lines, cut at his edges; the desktop app's rendering of a multi-line Button is unverified); `lab` fires for any check Claude runs (tests, linters, type checks, builds, validators: `VERIFY_COMMAND` in `register.tsx`); `boom` (new): a check failed, his flask swells, cracks and explodes (soot, frizzy hair, smoke); `ship` (new): a commit, push, pull request or release, he presses a big red button at a launch console and watches a rocket blast off at his right (the rocket and its smoke are clipped at the canvas, not drawn outside); `idea` now says "Plan approved" (it fires when the plan is approved, the raised hand covers the ask); 33 states; 26 new hand-drawn moves around `ship`, `boom`, the bell and idle.
- 0.23.0: more flavour. His left arm moves in every state but `asleep`. New drawing effects in `sprite.ts`: `spark` (four twinkles), `glint`, comic `lines` (shake, hit, speed, speak, jolt), `brow` (up, both, furrow, worry), `tear`, `vein`, `orbit` (stars around his head), `dots`, `dust`, `sweatFly`, `snore`, teeth that chatter (`chatter`) and `smirk`. Rewritten loops: `idle` (whistles, shades glint, tips them), `thinking` (16 frames: eyes wander, scratches his head with the left hand, an ellipsis grows), `detective` (the glass sweeps and comes up to his eye, tips his hat), `coffee` (blows on it, sips, then a caffeine buzz), `cold` (eyes dart in panic, teeth chatter, hugs himself; the flakes now fall down the far edges and over his head, never next to his hands), and a longer, funnier loop for most of the others. Moves: a prop is taken off with one hand and the next put on with the other (head and two-handed things leave with the left hand, the rest with the right; `carrySide`), every state declares how it begins (`ENTER`) so any pair with no hand-drawn move still gets a gesture-by-gesture morph, and 33 more hand-drawn moves (109 in all): the bell into each alert, the plan approved into the work, work to work, coffee back to work.
