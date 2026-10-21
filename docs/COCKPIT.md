# Cockpit (PR 1)

## Shape
New plugin `cockpit` (`cockpit/`), replacing `meters`, `saver`, `preflight-guard`, `prompt-enhancer` (moved to `archive/`, restorable). `mods-manager` also leaves the install list (does nothing in the desktop route) and moves to `archive/`; `tools\update-mods.cmd` and the CLAUDE.md routine stay.

Files (as built in PR 1): `hooks/register.tsx` holds every `$`-taking function and every hook, in sections (meters, saver, preflight, enhancer, band) and one hook per event; pure code is in `lib.ts` (numbers, SVG, attention, alerts), `saver-logic.ts`, `preflight-logic.ts`, `enhancer-logic.ts`, `handoff.ts`, `keys.ts`, `mascot.ts`, `bands.tsx`; `types/index.d.ts` is the one `PluginState.cockpit` contract. Why one file: an event can be hooked once per plugin, and a hook may pass `$` only to functions declared in the same file (CLAUDE.md).

## Band
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
| coffee, typing, thinking | the turn ends |
| talk | the notice is dismissed |

| Bubble | Ends when |
| --- | --- |
| "Needs your OK" | immediately when you answer |
| One with a button (warnings) | you click its button or send a message; or its warning ends by itself. After you answer it stays quiet until the warning ends and comes back. The button is a real button next to the bubble, not a click area over a drawing |
| `/cockpit demo <state>` (one state, with a button) | you click the button, send a message or `/cockpit demo off`. A tour of every state shows each bubble with its state for 4 s and leaves nothing pending |
| Any other | about 12 s after its state ends |


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
