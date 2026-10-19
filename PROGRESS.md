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
