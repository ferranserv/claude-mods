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
