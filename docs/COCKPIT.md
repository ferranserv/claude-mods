# Cockpit (design record)

This file is the design history, oldest first: PR 1's plan, then one section per version. Where a later section says it supersedes an earlier one, the later one is true. For what the cockpit does today read `README.md`; for Clawd, `docs/MASCOT.md`; for what to check on screen, `docs/VERIFY.md`. Since 0.21.0 the mascot's rules live in `docs/MASCOT.md`, and the click and press logic (every button is a drawing with a Client over it) is in its 0.25.x entries.

## PR 1 plan (parts superseded below)

## Shape
New plugin `cockpit` (`cockpit/`), replacing `meters`, `saver`, `preflight-guard`, `prompt-enhancer` (moved to `archive/`, restorable). `mods-manager` also leaves the install list (does nothing in the desktop route) and moves to `archive/`; `tools\update-mods.cmd` and the CLAUDE.md routine stay.

Files (as built in PR 1): `hooks/register.tsx` holds every `$`-taking function and every hook, in sections (meters, saver, preflight, enhancer, band) and one hook per event; pure code is in `lib.ts` (numbers, SVG, attention, alerts), `saver-logic.ts`, `preflight-logic.ts`, `enhancer-logic.ts`, `handoff.ts`, `keys.ts`, `mascot.ts`, `bands.tsx`; `types/index.d.ts` is the one `PluginState.cockpit` contract. Why one file: an event can be hooked once per plugin, and a hook may pass `$` only to functions declared in the same file (CLAUDE.md).

## Band (superseded by 0.15.0: one row, no arrow)
Collapsed (default): one row, mascot slot on the left, then chips: context %, cache countdown, 5h %, week pace, saver (when on), preflight count (when non-zero), Enhance button, expand arrow (small chevron, right edge). Never hides the core meters.
Expanded: today's full meters (bars, legend, cache cost line) plus saver detail, preflight detail and all action buttons.
Open/close: arrow toggles any time. It also opens by itself when a warning appears (context >= 50%, cache <= 5 min or cold, 5h >= 80%, allowance within 2% or over, preflight finding). If you collapse it while a warning stands, it stays collapsed until the level escalates. Choice kept in `$.store`.
Side-panel mode (`/meters side`) is kept as the same content in a pane.

## Every warning has its action (and no action without a warning)
| Warning | Action |
|---|---|
| Context >= 50% | Handoff (new session with handoff), Compact (the lighter one: `$.session.compact()`), Fresh |
| Context >= 80% | Handoff now (primary) |
| Cache about to expire / cold | Handoff, Dismiss; cold shows next-message cost warm vs cold |
| 5h >= 80% | Turn saver on |
| 5h reached | Copy handoff (resume after the reset time shown) |
| Allowance within 2% / over | Turn saver on, Handoff |
| Preflight: main, uncommitted, other session | existing: new worktree, checkpoint commit, commit finished files |
| Saver routed a prompt | Undo (send on your model), Turn saver off |
| Enhance rewrote the draft | Undo |
A warning that cannot name an action is dropped.

## Trims
- Drop the `/handoff` alias (held by two skills, always refused); keep `/newsession`, `/fresh`, `/cache`, `/meters`.
- Enhance sparkle: show only with a real draft IF the desktop app raises draft events. Session 3 found it may not; spike first, otherwise keep it dim-always.
- `mods-manager` archived; README install list updated.

## Batch 0 results (spike, done)
- `hooks.json` takes one module path; features split across files each registering `on('session.start')` fail validation ("registered twice"). So: one file for the `$` code.
- Cross-file `$` helpers pass `claude plugin validate` in this build, but the desktop app's build is unknown, so they are avoided.
- `atom()` must be written in the file that uses it, with literal plugin and key.
- SMIL animation on the desktop app: unverifiable from a cloud session. PR 1 ships a blinking, bobbing idle Clawd through a sandboxed Svg (`isInteractive`) as the test.

## Batches
| Batch | Work | Est. tokens |
|---|---|---|
| 0 | Spike: several modules in one `hooks.json`; shared `$.state` across files; SMIL animation in an SVG with `isInteractive` (tiny idle Clawd) | 25k |
| 1 | Scaffold `cockpit`, port meters (lib, handoff, keys, tests) | 80k |
| 2 | Port saver, preflight-guard, prompt-enhancer; options namespace; command names | 80k |
| 3 | Band: collapsed row, expand arrow, auto-open, store, side pane | 60k |
| 4 | Warnings with actions, trims | 40k |
| 5 | Archive old four, README, marketplace file, versions, tests | 30k |
Estimates are ~60% confident.

## Risks
1. Four plugins into one: option keys and command names must not collide; hook order changes. Mitigation: port tests first, keep them passing.
2. One reinstall for the owner (remove 4, add 1). Documented in the PR.
3. Mascot sets a minimum band height of about 48px (Clawd at 2x). The collapsed row replaces three or four strips, so net height should fall; verify on screen.
4. SMIL animation unproven on the desktop app: Batch 0 shows it with one idle Clawd. If it fails, PR 2 falls back to timer redraws.
5. Open PR #12 must merge first (it holds the chime that this plan moves).

## When each state and bubble ends

Checked against the code (0.11.0). "Resets by itself" means no new measurement or reply is needed.

| State | Ends when |
| --- | --- |
| hand (clipboard, "!") | the asked call ends, the next model request starts, or the turn ends. Only a real call counts (a `$.tool.check` query has no `tool_use_id`). The engine gives no "approved" signal, so a call you approved that keeps running keeps the hand until it ends. The bubble goes with it at once |
| writing | the handoff or enhance finishes, or the `/handoff` turn ends |
| oops, bell, lab, love, idea, wand, coins, plug | after 5 s (plug 6 s) |
| dizzy | the compaction ends |
| building, reading, browse | the tool ends (plus 1.2 s), or the turn ends |
| walk, hello | after 5 s |
| asleep, sleepy | the 5-hour limit passes its reset time (resets by itself, and a redraw is booked for that moment), or a new measurement is lower |
| mad, gauge | the weekly limit resets (by itself) or the week's pace catches up |
| fire, drunk | the context drops (new session, `/clear`, compaction) |
| cold, hourglass | a new message is sent (the cache restarts), or a reply arrives. Only while idle. Going to cold turns him blue over 2 s, leaving it warms him over 1.2 s |
| detective | the advice is dismissed or fixed |
| coffee, typing, running, thinking | the turn ends |
| talk | the notice is dismissed |

| Bubble | Ends when |
| --- | --- |
| "Needs your OK" | immediately when you answer |
| One with a button (warnings) | you click its button or send a message; or its warning ends by itself. After you answer it stays quiet until the warning ends and comes back. The button is a real button next to the bubble, not a click area over a drawing |
| `/cockpit demo <state>` (one state, with a button) | you click the button, send a message or `/cockpit demo off`. A tour of every state shows each bubble with its state for 4 s and leaves nothing pending |
| Any other | when its state ends (the words are deleted letter by letter). A pose that is still there but whose bubble is gone: hover over Clawd and it comes back while the pointer is on him |


## 0.13.0: tokens and accounting

- **Prompt cache belongs to a model.** A step the saver routes to Haiku no longer restarts the main model's countdown, nor feeds the window learner; a model switch (`classic.PostModelSwitch`) resets it. "Saved today" now prices what the main model would really have paid (warm cache = cached-read price) and what Haiku really billed (no cache of its own), and can come out lower than the old figure; it is floored at 0 on screen.
- **Switch into worktree** calls `EnterWorktree` through `$.tool.call` (no model turn). Falls back to asking Claude if the call is refused.
- **Preflight** memoises the repository root, so a refresh spends fewer git calls; the timer is 60 s.
- **Enhance style** option: `lean` (about 120 words, 2 questions, done criteria) or `full`.
- **Compact** button on the context warning.
- **Turn log**: one JSON line per finished turn in `~/.claude/cockpit-log/<session>.jsonl` (option `turnLog`); `python3 tools/cockpit-log.py` summarises it.
- While a bubble speaks, the context warning's own lines under the bar are left out, so the band keeps its height.

## 0.14.0: one channel for messages

The bubble is the one place the cockpit talks to you. What each thing used to do and does now:

| Event | Before | Now |
|---|---|---|
| Handoff, fresh, compact, enhance: busy, empty, failed | toast | bubble (8 s, over every state but the raised hand) |
| Enhance and handoff running | status line + toast + pose | the writing pose and its bubble |
| Enhance done | toast + bubble | the wand bubble ("Draft enhanced. ↩ restores yours.") |
| Handoff done | toast + bubble | the love bubble ("Handoff ready in the prompt box...") |
| Cache going cold | toast + OS notification + bubble | OS notification (for when the window is not focused) + hourglass bubble |
| Saver routed a step | a line under the band + coins bubble | the coins bubble ("Haiku answered that · saved $x today"); the line is in the open band only |
| Preflight, collapsed | first finding + "+N more" row + Hide | the first finding with "(+N more)" in its own line, then Hide |
| Context warning under the bar | always | left out while a bubble says it (the row keeps its height) |

Kept as rows on purpose: preflight findings and the notices that carry a command to copy or several buttons (worktree ready, committed + undo hint). A bubble has one button and one line. With the side panel open the band is hidden, so a message also goes to a toast there.

`/cockpit log` lists the last ten things the bubble said (with the longer form of each message and the last handoff brief's path), since a bubble fades. Legend text is 10 px (was 9).

## 0.15.0: one row, one bubble

Supersedes "Band" above (collapsed/expanded, arrow, auto-open, saver line, in-band bubble): all gone.

- The band is one row and always shows every meter. `pinnedOpen`, `snooze`, the arrow, `/cockpit open|close|auto`, `/cockpit bubble`, the saver line and `/saver strip` are removed.
- The bubble is a row under the meters, never over them. Its text wraps to two lines and ends in an ellipsis if it must be cut (`fitLines`). Its first button is drawn as a gray pill (`pillSvg`, the bubble's own fill, opaque) with the real Button laid over it, blank, in a box of the same whole cells with `overflow: hidden`; a "…" opens the other buttons in a row below. Desktop-native Buttons ignore the style of their children, which is why the pill is a drawing.
- Preflight findings and notices are bubbles too (`adviceSpeech`, `noticeSpeech`). The notice state now outranks the preflight one so a "worktree ready" is not hidden behind a finding.
- No blinking: Clawd and the meters are two drawings (`bandParts`). A new pose replaces only Clawd's; the meters' drawing is the same string, so it is not reloaded. A bubble is kept as long as its words stand; when new words replace old ones the drawing starts as the old bubble, deletes the old letters, resizes, and types the new (`speechSvg(text, room, prev)`, SMIL).
- A bubble that stands for a warning is only said while the warning stands.

## 0.16.0: the bubble lane

From the owner's testing of 0.15.0.
- The bubble has a lane of its own, one row (18 px), always there, under the meters and beside Clawd (meters moved right by 24 px for him). Silent or speaking, the cockpit has the same height: nothing opens or closes. The bubble is at the lane's left with its tail toward Clawd, its buttons at the right, all one row tall.
- The bubble is a pixel drawing again without any shadow: gray, black stepped border. It is as wide as its words (letters stretched with `textLength` to the width counted), one line (an ellipsis if it cannot fit).
- Its motion is one drawing per change (`bubbleArt(from, to, room)`): opening scales out of Clawd while the words are typed and the bubble grows with them; changing deletes the old words letter by letter, resizes, types the new; closing deletes the words as it shrinks, then scales back to Clawd. The frame is as wide as the lane's bubble zone whatever the words.
- No blink: each new drawing is laid over the old one (separate keyed Boxes, so the old one stays mounted), the old is dropped 250 ms later; a closed bubble leaves nothing drawn (`bubbleLane`).
- A bubble belongs to the pose on screen: no lingering after its state ends (a lingering "Editing x" over a detective was the bug), and it waits until Clawd has finished his move into the pose (`moveMs`) before it speaks.
- Hover over Clawd: a hidden card (same hover scope as Clawd) with what he would say about his current pose, with its first button, shown by the app only while the pointer is on him (`hoverCard`). Not seen in the cloud: whether the app honours a hover scope across drawings.
- The raised hand ("Waiting for your answer") is only for a question to you (`AskUserQuestion`, `ExitPlanMode`), not for permission prompts. Its "!" bobs. Typing has a mouth.

## 0.17.0: a painter, and the cockpit under a question

- New pose `creating` (31 states): Clawd with a curled moustache, a color palette in one hand and a paintbrush in the other, paints while the model is writing a file (the "Creating 11.3k tokens" stretch). Signal: the model's own stream in `turn.step` (a `tool` chunk for Write, Edit, MultiEdit or NotebookEdit, then the first `input` pieces name the file: bubble "Creating new_module.py"); the stream is passed on untouched. When the tool runs the hammer takes over at once (creating, building, reading and browse follow each other without the 5 s hold).
- The cockpit no longer yields to a survey or to a question from Claude (`hasSurvey`): it stays under it, and Clawd raises his hand for the question.

## 0.18.0: bubble polish, a clearer painter

- The lane is two cell rows tall (36 px); the bubble and its buttons are 26 px tall and centered in it, so the cockpit's height still never depends on them (the lane is always there). The Button over each pill covers the lane's two rows.
- Words keep their shape: the text is fitted to the width counted by letter spacing only (`lengthAdjust="spacing"`, never `spacingAndGlyphs`, which squashed it). The width counted is letter by letter (`textPx`: narrow, wide, capital, digit). 12 px of padding either side, font 13.
- The bubble takes all the row up to its buttons (their real widths) and no more than its words need; it is laid out afresh for the room it has whenever the window or the buttons change (the drawing is rebuilt, never scaled).
- The double bubble: a drawing that is still moving, or closing, is no longer held under the next one; only a settled bubble stays 120 ms under the one that replaces it.
- Typing has a concentration mouth (`focus`: a short flat line to one side, the corner pulled up).
- The painter is unmistakable: a handlebar moustache (no hat, no mouth), a wooden palette with a thumb hole and five blobs of paint in the left hand, a paintbrush in the right that dabs a canvas on a small easel at his right; the canvas fills in (sky, hill, sun) as the frames play.

## 0.18.1: a slimmer lane, no detective while Claude works

- The meters' drawing is 42 px (was 46) and the bubble's lane 30 px (bubble 26, 2 px margin above and below; was two rows, 36): the cockpit is 10 px shorter. The lane's height comes from a blank drawing in its flow (pixels, not rows); the bubbles are laid over it; the Button over each pill is two rows tall, clipped to the pill's box.
- The detective only shows when Claude is idle: findings are not offered while it works (they change under it), so the pose follows. While it thinks, Clawd thinks.
- Hovering over a pose with no bubble of its own says something short ("Thinking…", "Working on it", "Ready when you are").

## 0.18.2: the painter's moves

Hand-drawn moves between the painter and the builder (`creating>building`, `building>creating`) and the painter and typing (`creating>typing`, `typing>creating`): the hand takes the brush, then the palette, and shows them small while they are put away (or fetched the other way); the moustache is the last thing to go and the first to come; the hard hat and the hammer, or the laptop, come on at the end. `brush` and `palette` are in `HELD` so any other pair of states carries them the same way.

## 0.18.3: done <-> detective, a smaller typing mouth, buttons that are where they look

- Hand-drawn moves `bell>detective` and `detective>bell`: the bell is put away, the fedora and then the magnifier are fetched by hand (and back). `magnifier` is a carried prop now.
- Typing's concentration mouth is two pixels, low and to one side, well away from the eyes.
- Click areas: nothing about a button's or the bubble's place depends on the host's character cells any more. A button is a drawing as wide as its label (px) in a box that is exactly that big; the Button layer inside spans that box on all four edges and is cut at it, with two rows of Button covering its height. The lane is made of drawings in px (a blank one holds the bubble zone), the buttons sit at the right edge of the meters' width through a growing spacer, instead of a width counted in cells.

## 0.18.4: back to buttons laid out in the host's own cells (supersedes the click-area parts of 0.18.1 and 0.18.3)

The px-sized lane (0.18.1) and the Button layer spanning the box with two Buttons (0.18.3) were wrong: the desktop draws every Button natively, so two stacked Buttons showed as two buttons over the drawing, and a lane that is not a whole number of rows does not line up with the rows the Buttons are laid out in. What lined up (0.16 to 0.18.0) is back:
- The lane is exactly two rows (36 px). A button is a drawing a whole number of columns wide and the lane's height, in a box of those columns and two rows (`overflow: hidden`), and ONE Button sits at the box's corner with enough blank text to fill it.
- To keep the cockpit slim, the padding is cut by making the bubble and the buttons taller instead (30 px in the 36 px lane: 3 px above and below, was 5) and the meters' drawing 41 px (was 46).
- Rule from this: nothing but one Button per click target, and a click target is always laid out in whole rows and columns.

## 0.19.0: click Clawd, gum, one bubble written over, buttons in px (supersedes the click-area parts of 0.18.x)

- **Buttons**: the logic that lined up when the owner said the buttons worked (one Button exactly as tall as its drawing) is back, with nothing counted in the host's character cells. A button is a drawing one row (18 px) tall and as wide as its label in px, in a box that is exactly that big; ONE Button, one row tall like the drawing, is laid over it (its layer spans the box on all four edges and is cut at it). The lane is drawings in px: a blank one holds the bubble's width and height, a growing spacer pushes the buttons to the right edge of the meters' width. The buttons are one row tall while the bubble is 26 px: a Button is one row, so only a one-row drawing can be clicked everywhere it is drawn. (0.18.3's two stacked Buttons showed as two native buttons; 0.18.1's two-row hit area covered half of a 30 px pill.)
- **Bubble transition**: one drawing written over, no second bubble laid on the first. The old words are deleted letter by letter and the bubble shortens with them (down to its ends); the new words are typed and it lengthens with them, to the width they need. Opening and closing add the scale out of and back to Clawd. A settled bubble stays 120 ms under its replacement only (so nothing blinks); a moving or closing one is dropped at once.
- **Clawd is a button** (no hover exists in the app): one click on him says again what his pose is about. A warning you had answered comes back and stays until you answer it again; anything else ("Thinking…", the finding, "Ready when you are") is said for a few seconds.
- **Typing blows bubble gum**: chewing (the mouth opens and closes, very small and low), a pink bubble that swells in three sizes and pops into scraps, then chewing again; the loop is 16 frames.
- The painter's moustache stays clear of his eyes: nothing of it above the row two below the eyes.
- A session starting (or opened again) forgets the drawings made for another one (`mood.bub`, `drawn`, `move`, `msg`). Not reproduced in the cloud: the white box where Clawd is after switching sessions; if it still happens, say whether it clears by itself or on the next pose change.

## 0.20.0: the buttons as one picture, Copy handoff first, one bubble

- **The buttons are ONE picture** (`pillGroupSvg`): the primary pill and the "…" are drawn together, as tall as the bubble (26 px), with a gap, so they can never be drawn over one another (the "…" had been hiding under Handoff). The real Buttons are laid over it, one per pill, in a layer that spans the picture on all four edges and is cut there; the layer is a row whose pieces get the pills' widths and the gap as flex ratios (`width: 0`, `flexGrow`), so each Button sits over its pill in whatever units the host counts in. Each Button is one row tall, centered on its pill (a Button is one row: the pill's top and bottom 4 px are not a click target, the rest is).
- **Context's primary button is "Copy handoff"** (`copy`: write the brief, put it in the prompt box and the clipboard, the session stays). Behind the "…": Handoff (new session), Compact, Fresh. The cache warnings keep Handoff as their own (the cache is gone anyway).
- **One bubble, written over**: no second drawing is ever laid under or over the first. A change of words replaces the drawing with one that starts as the old bubble, deletes its words (it shortens with them) and types the new ones (it lengthens with them). The layering of 0.16 to 0.19 showed the old, longer bubble under the shrinking new one.

## 0.20.1: review before the PR

- Fix: when the bubble arrived with buttons (or left with them) the room it has changed, and that case was checked before the change of words, so it was redrawn still: no opening motion, no closing motion, a jump. A change of words now always plays (from the old words to the new, in the room it has now); only a change of room with the same words redraws still.
- Clawd's drawing no longer carries the bubble's words in its alt text (a changed prop could redraw him); the bubble's own drawing carries them.
- Tests: a bubble that arrives with buttons opens with the scale out of Clawd, one that leaves closes with the scale back; Clawd's alt is stable; `altOf` reads the bubble's drawing.
- Reviewed and left as they are: the timers (every `invalidate` is scheduled once per change, none from inside a render except the one that closes a stale menu), the stream observation in `turn.step` (every chunk passed on unchanged, the generator closed if it is cut short), the terminal and side-panel paths (text buttons, no drawings), the meters' drawing (a new string only when a number changes).

## The band over a question from Claude (0.24.0)
The dialog of a question (`AskUserQuestion`) replaces the prompt area, and the band above the prompt went with it. Now a `ui.render` hook on `AskUserQuestion` draws a small band over the dialog and keeps the engine's dialog once beneath it (`hooks/register.tsx`, `bandTree` with `plain: true`).
- The dialog's tree takes no size and no place: no overlay, no fixed width, no buttons, no speech. On the desktop it is Clawd and the meters at their own size in a row; on the terminal one text row (12-row budget counted at 40 columns), cut at the edge.
- While the dialog is open the band above the prompt steps aside (`mood.dialog`), so it is never on screen twice. The flag ends with the tool call (`toolEnds`), the turn, or a new message.
- Not verified on the real desktop app: whether it also keeps drawing AbovePrompt during the dialog (the types do not say), and how the dialog's own layout looks with the band over it. If the dialog is skipped, the engine draws it alone (an invalid tree is skipped).

## 0.26.0 to 0.27.x
- `running`: typing with green code scrolling behind him, for a shell command past 2 s or a check, install or build (see `docs/MASCOT.md`).
- The enhance wand and the Undo arrow are the same 26 x 26 px rounded square with a thin outline in the meters' gray, press targets like the pills (the whole drawing is the click area, no Button over it; the terminal keeps text buttons). While Enhance runs the wand button turns green and nothing else changes (no second wand, no "enhancing" text); it is gray again when it is done.
- 0.28.1: moves out of typing and running begin on the loop frame he is on (no jump of the code lines or the gum); see `docs/MASCOT.md`.
- 0.29.0: `fishing` while a background task runs (see `docs/MASCOT.md`); every drawing 37 to 56 % smaller (the host blanks a replaced drawing for a few frames, longer for big ones).
- 0.30.0: the bubble closes by shrinking into Clawd as its words go (the opening backwards); clicking Clawd in any pose says something (light lines for every state); see `docs/MASCOT.md`.

### 0.31.0
- First context warning moved from 50% to 45% (150k tokens still warns first on a 1M window; on 200k, 45% is 90k). Rot depends on absolute tokens more than on percent, so both stay.
- Question dialog: the band's drawings now get an explicit width and height (without them the desktop scaled Clawd up to the slot and he covered the question).

### 0.31.1
- Size warning raised from 150k to 250k tokens (owner decision): on a 1M window the 45% never speaks first; on a 200k window it is out of reach, so only the 45% fires.

### 0.32.0
- Context warning is by percent only: 50% (orange), 80% (red). `warnTokens` stays as an option but is 0 (off) by default, so the warning is proportional whatever model is in use (owner decision, supersedes the 45% and 250k entries above). `/meters tokens off` turns the size warning off again.
- New state `mcp` for connector tools (see `docs/MASCOT.md`).

### 0.33.0
- Bubble exit: words first (letter by letter, the bubble shortening), then the shrink into Clawd; 0.55 s for a short line, up to 0.9 s for a long one. Supersedes the "both at once, 0.35 s" of 0.30.0. Why: the host replaces the drawing and takes a few frames to load it, so a 0.35 s close could finish unseen. The opening takes up to 0.7 s and was seen. New test closes via the dots and via expiry.

### 0.33.1
- Recording of the desktop app (30 fps frames): the opening grows over 0.4 s (the typing of 0.7 s seen from 0.3 s in), the exit is one frame, on a click and on expiry alike. The test harness could not show this (it draws the exit drawing). Causes tried: empty `alt` on the exit drawing (now non-empty) and the host's 0.3 s late start (the exit now holds 0.3 s first). If the exit still vanishes, the next step is to stop replacing the drawing for the exit (animate the opening drawing itself, with the exit built in for bubbles that expire on a known time).

### 0.33.2
- The exit shows (0.33.1 worked) but blinks once before it starts: old drawing blank, then the exit's full bubble. The old drawing now stays under the exit's until it has shown (`EXIT_OVERLAP_MS`), which breaks the "one drawing at a time" rule of 0.19.0 for 0.6 s on purpose: the two are identical at that moment, so nothing doubles. Test: two bubble drawings right after hiding, one 400 ms later; `altOf` in the tests reads only the last one. If the blink remains, tune `EXIT_OVERLAP_MS` (longer if the exit blinks late, shorter if the full bubble stays too long before the words go).

### 0.33.3
- Frame analysis of a recording of 0.33.2: the exit's drawing appears about 0.1 s after the click (that is the old blink), starts to move after its hold; the old drawing under it was dropped about 2 frames after that, so its right end showed. The rule for the two numbers: drop time (`EXIT_OVERLAP_MS`) must be after the exit shows (host delay, about 0.1 to 0.15 s) and before it moves (host delay + `LEAD_S`). Now 0.3 s and 0.55 s at the earliest. Measure again from a recording if the host is slower on another machine.

### 0.34.0
- Same idea as the bubble exit (0.33.x) for Clawd, in a form that cannot ghost. A first try kept the old, moving drawing under the new one (it keeps looping: a ghost; PR 72, closed by the owner as not clean). Now the thing under the new drawing is a still copy of its own first frame, which is what the new drawing starts with and holds, so the two are identical until the still is dropped. The still is a non-interactive Svg (an image: no sandboxed frame to load). Cost: a pose reacts about 0.12 s later (first frame held about 0.2 s). Unverified on the desktop: that the still itself shows without a gap. Evidence for the problem: `Screen_Recording_2026-10-23_111509.mp4`, reading to the next pose, 2 blank frames. If a gap remains, lengthening `MASCOT_OVERLAP_MS` does not help; the next step would be to ask the host for a way to change a drawing without replacing it.

### 0.35.0
- **Bottom of the band**: the lane takes 7 px less room (`LANE_PULL` in `lib.ts`) than what is drawn in it: the bubble and the buttons hang 7 px below it, into the panel's own bottom padding (the gap from the bubble to the panel's edge was about 15 px, now about 8). The buttons are laid on the lane at its right edge instead of in its row (they would set its height). While the "…" menu row is open the pull is 0 (nothing hangs over the menu). Unverified on the desktop: that the panel does not clip what hangs into its padding. If it does, set `LANE_PULL` to 0 (the old spacing) or lower it.
- **Asleep alone** and **cold rebuilt**: see `docs/MASCOT.md`.

### 0.36.0
- **Alignment**: the pills were laid in a column under a 2 px spacer drawing, a different coordinate system from the bubble's absolute box. Now each pill drawing is lane-tall (`LANE_H`) with the pill at `BUBBLE_Y`, placed at top 0 in the same lane: one line, no spacer (`pillGroupSvg(..., { lane: true })`).
- **Motion**: `mood.btn` follows the labels shown. none to some: `in` (after the bubble); some to none: the old labels are drawn once more with `out` (inert, no press target) plus a still copy under it for `EXIT_OVERLAP_MS`, like the bubble's exit. Other label changes redraw still. Not animated: the "…" menu row.
- **Cold/hourglass action** is `copy` (was `handoff`, which runs `/clear`). `/handoff` and the hotkey still clear; the bubble's "…" menu on context warnings still offers Handoff.

### 0.36.1
- Labels in `ACTION_LABELS` state the clear. The `/handoff`, `/fresh` commands keep their names.

### 0.37.0
- `labelLocally` (saver-logic.ts) checks `COMMS` before the hard words: an email, message, redaction, correction or translation prompt is `easy` even if it says "write", unless `TECHNICAL` also matches (code, bug, design, plan...). Up to the 800-character cap; bullet lists no longer make it hard.
