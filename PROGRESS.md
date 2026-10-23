# PROGRESS

## Session 2 (2026-10-19): saver + meters in the repo
Done
- meters tests: lib (pure), mount (desktop + terminal, side/top, survey, session restore), behavior (cache learning, notice, handoff, hotkeys, buttons), bands. 85 passing.
- saver: 14 passing (stack, divider). plan-progress 14, prompt-enhancer 12. All four: `claude plugin validate` ok, tsc clean (strict).
- Found and fixed: plan-progress and prompt-enhancer returned their tree without calling `next`, replacing any band beneath (meters, saver) while visible. All four now stack through `hooks/bands.tsx` by rank.
- Layout: meters above saver, rule between them, legend wraps to 2 lines, font 9px, band up to 1400px (8 px per column; was 7 and 980 max).
- Context bar: blue < 50%, orange from 50% or 150k tokens (quality warning), red past 80%. Thresholds are options.
- Cache meter (4th column / `Cache` in the terminal line), `/cache`, going-cold notice, cost warm vs cold.
- Handoff: `/handoff`, `/fresh`, buttons, `meta+h` / `meta+n`.
- Side panel: inline (not docked) placement draws the band layout; person closing the pane is remembered.

Not verified (see final report): anything on a real screen; `$.command.run('clear')` from a timer; `$.ui.notify` on the desktop; the real cache TTL; pasting after /clear; older Claude Code builds rejecting helpers that take `$`.

## Session 3 (2026-10-19): first real screenshots (desktop app, Windows)
Seen working: meters band and side panel, cache countdown ticking, saver strip below the bars, stacking order meters > saver.
Fixed after the screenshots
- Saver rule was missing: saver could not see the bars (it is innermost). The rule is now its own band (rank 25) emitted by saver; order-independent, tested both ways.
- Enhance sparkle was hidden until a draft was typed, and the desktop app may not raise draft events: it is now always shown (dim without a draft).
- plan-progress is conditional by design (needs `/goal` or 2+ tasks); chime has a Windows PowerShell fallback.
Still unverified: sparkle position/size, hotkeys, handoff buttons and paste after clear, going-cold notification, plan-progress panel, chime on Windows.

## Session 3b: countdown semantics (owner feedback)
- Countdown now restarts when a message is sent (prompt.submit) and when each request goes out, not when a reply ends. Commands and hidden prompts do not restart it.
- Display moves in 5-minute steps (option); redraw only when the label changes; the timer runs every 15 s instead of every second.
- Window learning measures the idle gap from the end of the previous request (new field `lastEndAt`), so sending a message in between does not break it.

## Session 3c: `/cache` did not work in the desktop app (owner report)
- Likely cause (not confirmed, no error text): `session.start` registered commands in a row and stopped at the first refusal (the owner has a `handoff` skill, so `/handoff` is probably refused). `/meters` registers first, so it worked while `/cache` never registered; the pulse timer and saved settings after it were skipped too.
- Fix: each command registers on its own (meters, cache, fresh, handoff, newsession); plan-progress and prompt-enhancer wrapped the same way. `/meters status` lists refused names; `/meters cache|handoff|fresh` are fallbacks; `/newsession` aliases `/handoff`.

## Session 3d: stale install (owner)
- Cause confirmed: the app installed from the owner's local clone `C:\Users\fservitje\mods` (stuck at PR #2); removing/re-adding the marketplace read the same folder. `git pull` there fixed it.
- mods-manager 0.2.0: session-start `git pull --ff-only` in the plugins' folder (parent of the plugin root), throttled to 1/hour, toast when HEAD changed, one notice if git cannot run, `/updatemods`. 7 tests. UNVERIFIED: whether the desktop app lets a mod run git at all (the CLI docs say process.run is CLI only).
- Needs one manual `git pull` to receive 0.2.0 itself; automatic afterwards.

## Session 3e: marketplace renamed `my-mods` -> `claude-mods`
- Owner chose a GitHub-only install. The old local `my-mods` marketplace (a clone at `C:\Users\fservitje\mods`) collided by name with the GitHub one, so re-adding kept reading the stale folder. New name = no collision. mods-manager 0.2.1 (description/names only).
- Migration is in README ("Moving from the old `my-mods` install"). Order matters: merge first, then remove the old marketplace, then add `ferranserv/claude-mods`.
- Unverified: whether the app lists a GitHub marketplace's new versions without removing/re-adding it (Update button).

## Session 4: QA results (owner's QA run)
PASS: versions, band layout, /clear resets cache, notice (once, ~2:47 left), countdown continues across /cache, plain chat has no plan panel.
Fixed
- Cache label showed 55m right after a message (rounded down): now rounds up to the step (60m, 30m for a 30-min window).
- Rule under the bars now belongs to meters (it left a dangling rule + strip in side mode); saver strip greys out entirely when off; `/saver why`.
- Context warning levels settable with `/meters warn|red|tokens|limits` (the options screen is not reachable in the app), so S3/S4/S8 can run.
- prompt-enhancer never loaded (no /enhance, no sparkle): the only event no working mod uses was `prompt.change`; removed (unconfirmed cause).
- plan-progress: SVG panel on desktop like the meters; idle state; x button; tool-name variants (task_create, update_plan, ids); `/plan-debug`. Checklist never ticking is still undiagnosed: `/plan-debug` shows what the app sends.
Not fixed / by design: /handoff is held by two skills (use /newsession); limits update only when a reply reports them; the panel appearing twice is probably the app's own /goal display.
Unverified: all of the above on the app.

## Session 4b: saver strip
- Owner ran the OLD saver (`/saver why` printed the 0.1.2 help): the fixes were not merged yet.
- saver 0.2.0: strip hidden unless saver is on and the last answer was routed to Haiku (`/saver strip active|on|always`); the rule above it is saver's again (appears only with the strip); meters 0.2.5 draws no rule. 23 saver tests.

## Session 4c: the update routine is documented
- Owner's stale-versions problem: the app's saved marketplace copy is only pulled by hand. Routine now in `mods-manager/skills/sync-mods/SKILL.md` (top section), README ("Keeping the mods current"), `CLAUDE.md` (so every session reminds), and `tools/update-mods.cmd` (pull, print versions, say what to click; written for Windows, NOT run here).
- Option not built: have mods-manager pull the marketplace copy itself at session start (the path is derivable from its plugin root). Needs `$.process.run` in the desktop app, unverified.

## Session 5: QA round 3 fixes
Passed: versions, cache label, side mode, warning levels, fresh and handoff buttons, /meters handoff|fresh, saver strip, sparkle and /enhance loaded (N6 steps 1-4).
Fixed
- N4e: the handoff copy was never written on Windows (looked up HOME only; Windows has USERPROFILE). Now HOME, USERPROFILE, HOMEDRIVE+HOMEPATH; the toast says where the copy is, or that it could not be saved.
- N8: buttons showed while Claude worked because the app does not set `isWorking`: the mod now tracks turns itself. Timer frozen: a /goal continuation turn is not a typed prompt, so the clock never restarted; `turn.start` now restarts it.
- N5: checklist empty although `update_plan` ran six times: the list is now found in any plan/todo/task/step-named tool with a list of {text, status} items; `/plan-debug` prints the last such call. Phase chips: full width, joined by lines, green for phases already visited. 
- Requested: copy-handoff without clearing (button, `/newsession brief`, `/meters brief`).
- N4c: could not reproduce (`/newsession paste` never clears in tests, now covered for several spellings). Probably `/newsession` was typed without `paste`.
Not fixed: Alt hotkeys (app-level keys, not needed); the goal evaluator's re-prompt loop belongs to the app's /goal.
Unverified on the app: all of it. Open: "draft missing from prompt box" in N8 is unexplained.

## Session 6: preflight-guard 0.1.0 (new mod)
- Rules in README ("preflight-guard: the rules"); pure rules in `preflight-guard/hooks/logic.ts`. 21 tests (15 rules, 6 flows with a fake git), tsc strict clean, validate ok. Click-commit commands also checked against a real git repo (deleted files, .env left, worktree add, switch -c).
- Peers find each other through heartbeat files in `<git common dir>/preflight-guard/` (shared by all worktrees, never committed). No delete call exists, so an ended session overwrites its file with phase `ended`.
- Band key `band:5:preflight-guard` is hand-written (top of the band) so the four shared `bands.tsx` copies stay identical; preflight-guard carries its own identical copy.
- UNVERIFIED on the desktop app: `$.process.run` (docs say CLI only; without it the band stays empty and `/preflight` says all clear: check `/preflight` first), `turn.start`/`tool.call` heartbeats, Switch (asks Claude to call EnterWorktree with the path, one short turn).

## Session 6b: preflight-guard 0.1.1
- Added `+added −removed` line counts (from `git diff HEAD --numstat`) to the "uncommitted changes" and "session finished" lines and to the confirm button. Counts cover tracked files only and only the files a click would commit. Owner's desktop app already puts each session in a worktree (branch `claude/<topic>-<hash>`) and has its own Changes pane; that pane has no mod API, so the mod reads git itself.

## Session 6c: preflight-guard 0.1.2 (first real screenshot)
- Owner confirmed git runs in the desktop app (band showed "13 uncommitted changes (+313 −134)"), so `$.process.run` works there. Layout was wrong: wrapped onto 3 lines, buttons touching, no gap above plan-progress, wording unclear.
- Now one row: `● 13 files changed (+313 −134) · [Commit checkpoint] · [Hide]`, blank line below, gap between items; Re-check button removed (auto every 30 s, `/preflight` on demand). Notices (committed, worktree ready) replace the row until OK.

## Session 7 (2026-10-20): cockpit plan, mascot chosen
Done
- PR #12 open: plan-progress archived, chime moved into meters 0.4.0 (merge before PR 1).
- Decisions (owner): one `cockpit` plugin replacing meters + saver + preflight-guard + prompt-enhancer; mascot = Clawd (Claude Code's); 3 PRs (cockpit, mascot, polish); warnings must carry actions; exceptions-only, turn timer, money glance dropped.
- Mascot explored: golden doodle (profile, then front from the owner's photo) and five alternatives; owner chose Clawd. Sheet: docs/mascot/clawd-sheet.html (18 states).
- Plan written: REQUEST.md, ARCHITECTURE.md, docs/COCKPIT.md, docs/MASCOT.md.
Next
1. Owner merges PR #12 and runs the update routine.
2. Restart the branch from main; PR 1 Batch 0 (spike: multi-module hooks.json, shared state, SMIL).
Open: SMIL in the desktop app; band height with a 48 px mascot; whether draft events reach the app (sparkle trim).
Tokens so far this session: about 0.9M (mostly mascot design).

## Session 8 (2026-10-20): Clawd revised, PR #12 merged
- PR #12 merged, chime confirmed working by the owner. Branch restarted from main.
- Clawd sheet v2 (docs/mascot/clawd-sheet.html): owner's notes applied (loading circle, big bell with notes, forehead sweat and handkerchief, hourglass under the hand, static frozen with wide ice, bed with eye mask and alarm clock, fedora and real magnifier, wizard hat, beach idle) and 11 new scenarios added. Canvas 34 x 28 (asleep 56 wide). No pixel outside the canvas, bubbles wrap.
- Owner will send more reference pictures for extra poses.
- Sheet v3 applied the owner's second round (bell below hand, beach without floor, forehead sweat, hourglass shape, no bed, glowing bulb, coffee, hammer, browser with magnifier, lab coat). Rule recorded: no floors or full-width scenery.
Next: PR 1 (owner said go).

## Session 9 (2026-10-20): PR 1, the cockpit plugin
Done
- `cockpit` 0.1.0: one band above the prompt (Clawd idle, collapsed row of four meters, arrow to expand, opens by itself on a warning, `/cockpit open|close|auto`), alerts with buttons (lib `alertsOf`), saver, preflight and enhancer merged in. 153 tests pass, `claude plugin validate` ok, tsc strict clean.
- meters, saver, preflight-guard, prompt-enhancer, mods-manager moved to `archive/`; marketplace file and `.claude/settings.json` list only `cockpit`; README rewritten; update routine moved to `docs/UPDATING.md`.
- Batch 0 findings in docs/COCKPIT.md: one `$` file, one hook per event.
- `/handoff` dropped (two skills hold the name); `/newsession` stays.
Not verified (owner on the desktop app): SMIL animation of Clawd; band height with the 56 px mascot; the arrow and auto-open feel; chime; preflight and saver after the merge.
Next: owner checks PR 1 on screen, then PR 2 (30 mascot states from docs/mascot/clawd-sheet.html).
Tokens: about 1.2M this session in total (design 0.9M, PR 1 0.3M).

## Session 10 (2026-10-20): PR 2, Clawd's states (stacked on PR #13)
- Sheet v4 (owner's round 3): palm tree behind him and inside the canvas, sun inside, tipsy replaces uneasy, bulb glow clean, lab without the coat, priority section.
- cockpit 0.2.0: 29 states, `mood.ts` priority and bubbles, signals from tool.call, tool.check, session.compact, mcp.connect and the turn/session events; `/cockpit demo`. 182 tests pass.
- Not verified on the app: animation playback, which tools/events actually reach the hooks on the desktop build (permission ask, compaction, MCP), band height.

## Session 11 (2026-10-20): PR 3, polish (stacked on PR 2)
- No screenshots yet, so PR 3 is what can be done blind: `/cockpit mascot on|small|off` (and the `mascot` option) because the 56 px mascot may be too tall, a checklist for your screen (docs/VERIFY.md), the README state table.
- cockpit 0.3.0, 185 tests pass.
- Waiting on the owner: the checks in docs/VERIFY.md. Likely adjustments after that: band height, which desktop events really fire (permission ask, compaction, MCP), SVG animation playback, anything in the sheet.
- Merge order: #13, then #14, then #15 (each stacked on the one before).

## Next
1. Owner: paste the screenshot, run the mods on the real app, report what cuts off or collides.
2. Owner: run `python3 tools/audit-sessions.py`, pick an idea from the five.
3. Confirm `meta+h` / `meta+n` / `meta+e` reach the prompt box in the owner's terminal.

## Open decisions
- Enhance button cannot sit inside the prompt box (no API site): band above the prompt.
- A dev (hot-reloaded) copy and the installed copy of the same mod can double-load.
- Weekdays Mon-Fri only (weekend counts as Friday); weekly reset time not shown (kept from the handoff).

## Context refresher
Mods are `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`. Check: `claude plugin validate|test <dir>`. A hook may pass `$` only to functions declared at the top of the file (CLI 2.1.303). Tests run only inside one plugin's folder, so band mods cannot be loaded together in one test.

## Session 4 (2026-10-20): cockpit 0.4.0 (VERIFY round)
Done: 30 states (writing added), neutral first frames + 0.5 s crossfade, 5 s hold rule, floating bubble (`/cockpit bubble`), permission-ask debounce, PowerShell test runs, hand = clipboard + pencil, meters same collapsed/open, short buttons with icons, single 🪄 control, narrow layout (EST 0.6, short subtitles). 188 tests pass, validate ok, tsc clean.
Not verifiable from the cloud: floating bubble overlay, crossfade, 🪄 rendering, which permission/compaction events the desktop build raises.

## Session (2026-10-21): cockpit 0.12.0 (button areas, transitions audit)
Done: every warning button is a real Button whose label carries the color (no drawing with a click area laid over it); a bubble with a button is drawn on its own with its button beside it in one row (the old two-row overlay at a guessed spot is gone); the "bell" in idle>hand was the carried clipboard (now a clipboard with a clip; hats are carried by kind, wrench, wand, glass and browser have their own); any state>cold fades to blue over 2 s (1.2 s back); `/cockpit demo <state>` shows the bubble with its state and leaves nothing pending (one state with a button stays until answered). All 870 moves audited by script (no foreign props, no missing drawings).
Not verifiable from the cloud: click alignment on the desktop (VERIFY 70-77).


## Session (2026-10-21): cockpit audit, PR 1 = 0.13.0 (tokens, accounting, functions)
Done: bubbles follow animation priority (0.12.1); raised hand ends with its call and queries never raise it (0.12.2); 0.13.0 = cache accounting per model (T1), EnterWorktree without a model turn (T2), repo memo and 60 s preflight (T4), lean enhance (T5), Compact button (A1), turn log + tools/cockpit-log.py (A2), PostModelSwitch resets the countdown, notify title. tsc clean (4 old errors fixed). 226 tests.
Dropped: T3 (PreModelSwitch cost fields: small gain). Not verifiable from the cloud: EnterWorktree via `$.tool.call`, real billing behind the saver figure.
Next: PR 2 = 0.14.0 UX (U1-U8, one message channel).

## Session (2026-10-21): PR 2 = cockpit 0.14.0 (one channel)
Done: `tell()` puts every message in the bubble (toasts only with the side panel), status-line texts removed, saver line only in the open band, coins/love bubbles reworded, preflight collapsed row shorter, `/cockpit log`, linger 12 s, legend 10 px. 228 tests, tsc clean.
Not done (by design): preflight rows and command-carrying notices stay rows (a bubble has one button, one line); contrast of orange on a light theme unchanged (dark theme passes 4.5:1; the theme cannot be detected).

## Hotfix 0.14.1 (2026-10-21): cockpit did not show in new sessions after 0.14.0
Owner: after merging and updating, new sessions showed no cockpit (a running session kept the old one). Likely cause (not confirmed, no error text): 0.13.0 added engine surface the desktop build may not have, and one unknown name stops the whole module loading: `classic.PostModelSwitch`, `$.session.compact`, `$.tool.call`. Removed all three: the cache reset on a model switch moved into the existing `classic.PreModelSwitch` hook; Compact runs `$.command.run({command:'compact'})`; the worktree switch is the old one-turn prompt again (the saving T2 is gone until the app's version is known).
Rule: no new engine event or `$` method in a mod without a spike on the owner's app first. If 0.14.1 loads, add them back one per release to find the culprit.

## Session (2026-10-21): cockpit 0.15.0 (one row, one bubble) on top of the 0.14.1 hotfix
Owner asked: saver line gone, band never expands, U5 into the bubble, meters always visible, buttons solid and same gray as the bubble, text always fits, no blinking, typewriter between bubbles. Owner chose in the questions: remove the arrow completely; a bubble button plus a "…" menu; most important finding first, the others in the menu.
Done: see docs/COCKPIT.md "0.15.0". 225 tests, tsc clean, validate ok.
Not verifiable from the cloud: the Button-over-drawing alignment (cells: 8 x 18 px) and Box overflow clipping on the desktop app; SMIL typewriter; whether the 0.14.1 hotfix loads (still waiting on the owner's report).

## Session (2026-10-21): cockpit 0.16.0 (the bubble lane)
Owner's list after testing 0.15.0 (screenshots): bubble row expanded the cockpit; shadow; blink between bubbles; empty space after the text; buttons right-aligned at the bubble's height; bubble from Clawd; meters further right; "!" animation; hand only for questions; typing mouth; typewriter open/close + scale; remove the shadow entirely; hover over Clawd brings the bubble back; bubbles must match the pose (a lingering "Editing" over a detective).
Done: docs/COCKPIT.md "0.16.0". 225 tests, tsc clean, validate ok.
Not verifiable from the cloud: keyed layers surviving a redraw without reload, hover scope across drawings, textLength rendering, the SMIL motion.

## Session (2026-10-21): cockpit 0.17.0
Owner: "Creating 11.3k tokens" showed Needs your OK (old build; fixed in 0.16: hand only for questions) and asked for a painter pose with a moustache; also the cockpit vanished when Claude asked a question (the hook yielded to `hasSurvey`; now it stays).
Done: `creating` pose + stream signal, no yield to surveys, README/docs. 226 tests, tsc clean.
Not verifiable from the cloud: the `turn.step` stream observation on the desktop build (it passes every chunk on unchanged), the cockpit under a question card.

## Session (2026-10-21): cockpit 0.18.0
Owner's list: bigger bubble height without squashed font, padding, double bubble when text is long, concentration mouth for typing, a clearer painter, bubble as wide as possible up to the buttons and responsive (not scaled).
Done: docs/COCKPIT.md "0.18.0". 229 tests, validate ok, tsc clean.
Not verifiable from the cloud: the 2-row lane and 26 px bubble in the app, letter-spacing fit in the app's font, the double-bubble fix.

## Session (2026-10-21): cockpit 0.18.1
Owner: halve the padding of the bubble lane (above to the weekly line, below to the band's edge); the detective showed while Claude was thinking; no bubble on hover there.
Done: meters 42 px + lane 30 px, detective only when idle, hover hints. 230 tests.
Not verifiable from the cloud: the lane's px height in the app (blank drawing in flow), the Button's clip.

## 0.18.2: painter <-> builder and painter <-> typing moves (hand-drawn), brush and palette carried. 231 tests.

## 0.18.3: bell<->detective moves, smaller typing mouth, button hit areas sized by their drawings (px) instead of cells. 232 tests.

## 0.18.4: buttons back to the cell-based layout that lined up (0.18.1/0.18.3 broke it: two stacked Buttons showed as two native buttons). Bubble/buttons 30 px in a 36 px lane, meters 41 px. 232 tests.

## 0.19.0: click on Clawd instead of hover, gum bubbles while typing, bubble written over (shortens/lengthens with letters), buttons one row tall in px with one Button each, moustache clear of the eyes, state reset on session start. 232 tests.

## 0.20.0: buttons as one picture with flex-ratio Buttons over it (the "…" no longer hides under Handoff), Copy handoff is context's primary, no layering of bubbles. 234 tests.

## 0.20.1: review before the PR: opening/closing motions were skipped when the buttons (and so the room) changed with the words; Clawd's alt no longer carries the bubble's words. 235 tests.

## 0.26.0: `running` = typing plus green code scrolling behind him (shell command past 2 s, or a check/install/build at once); moves typing<->running and a twin of every typing move. Tests: `claude plugin test cockpit`.

## 0.26.1: running calmer: half the lines, softer greens; in moves the dashes shrink away / grow, and finish at 60% / 70% of the move.

## 0.26.2: running's code starts after the laptop opens and ends before it closes; the dissolve stays.

## 0.27.0: running's code rises from the bottom and leaves from the bottom up; blink fixed (scroll jump at the end of the move in); the wand is a rounded press target, centered.

## 0.27.1: wand and Undo: same 26 x 26 rounded square, thin outline, press targets.

## 0.27.2: wand and Undo smaller and in the meters' gray; the wand turns green while Enhance runs; README and docs brought up to date for sharing.

## 0.27.3: the plugin and marketplace descriptions (what the app shows) say what the cockpit is today (no expand arrow, 34 states); the raised-hand option says questions, not permission prompts.

## 0.28.1: reverted 0.28.0 (the separate code layer did not show); moves out of typing/running begin on the loop frame he is on, so the code lines and the gum no longer jump.

## 0.29.0: `fishing` (background task pose, 23 s loop, hat, rod, thin ripple, moves to the common states); drawings 37-56 % smaller and pixel-identical (base + deltas, rectangles, strokes) to shorten the host's blank frames on every pose change.

## 0.30.0: the bubble closes as the opening backwards (shrinks into Clawd while the words go); every state has three light hover lines, so a click on Clawd always answers.
