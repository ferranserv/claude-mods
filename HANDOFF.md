# HANDOFF for a cloud session: claude-mods (2026-10-19)

You are continuing work on two Claude Code mods in this repo (`ferranserv/claude-mods`, branch `main`). A local session built them; you cannot see its machine, so everything you need is in this repo. Paths below are relative to the repo root.

Also read `REQUEST.md` and `PROGRESS.md`: they hold the owner's wider list (cache countdown, Handoff & Clear, hotkeys, context-bar colors). `meters` is the merged successor of the owner's context-bar and usage-limits mods.

## What exists
- `saver/` : routes "easy" prompts to Haiku 5.5 (every request of the turn) while context < 100K tokens; hard prompts stay on the user's model. Unclear prompts are labelled by Haiku 5.5 via `$.model.classify`. `/saver on|off`. A centered strip above the prompt shows the model that answered last and "saved today" (list prices: Haiku 5.5 $0.10 in / $0.50 out per MTok vs the main model's price; every input-side token, cached or not, is counted at the plain input price, so savings are an estimate).
  - `saver/hooks/register.tsx` (hooks), `saver/hooks/lib.ts` (pure logic: labelling, prices, savings), `saver/hooks/lib.test.ts` (7 tests, passing).
- `meters/` : context window bar (red past 80%, legend suggesting a fresh session: warn at 150k tokens, alert past 80%), 5-hour limit bar, weekly limit bar split into five 20% weekday slots (fills with what is used, Monday first, day letters centered under each slot, pace line like `Mon 14% under`). On the desktop surface it is drawn as SVG in one ~46px band above the prompt; on the terminal it is a one-line text fallback. `/meters side` opens a vertical side panel (bars rise from the bottom), `/meters top` returns to the band. It replaces two earlier mods (`context-bar`, `usage-limits`) that are not in this repo.
  - `meters/hooks/register.tsx`, `meters/hooks/lib.ts` (model + SVG builders).
- Each mod: `.claude-plugin/plugin.json`, `hooks/hooks.json` -> `hooks/register.tsx`, `types/index.d.ts` (state contract). `.claude-plugin/marketplace.json` at the root lists both.

## State
- Both mods pass `claude plugin validate`. `saver` tests pass. **`meters` has no tests.**
- The SVG layout of `meters` has never been seen on screen. The previous text-bar version wrapped on the desktop app's proportional font, which is why it was rebuilt as SVG.
- No type-check has run (no Node/tsc on the author's machine).

## Your tasks
1. If the Claude Code CLI is available, run `claude plugin validate saver`, `claude plugin validate meters` and `claude plugin test saver`. If not, review by reading.
2. Add `meters/hooks/lib.test.ts` (pure tests: `model`, `bandSvg`, `sideSvg`, `legendFor`, `line`, `sliceFrac`, `pace`, `resetShort`; check the SVG has no `NaN`, one `<svg>` root, five weekday slots, day letters centered) and `meters/hooks/mount.test.ts`. The mount test needs, inside `test(name, async ($, on) => {...})`: `on('session.measure', (_, e) => ({ changed: e.changed }))`, `on('ui.render', () => ({ type: 'engine', ref: 0 }))`, and `mock.clock(on, { now })` (from `claude-code/testing`), then `$.ui.mount({ plugin: 'meters', surface: 'desktop' | 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { bodyRows: 10 }, view: {} } })`. Seed data by calling `$.session.measure({ context: {...}, rateLimits: [...], changed: [...] })`.
3. Review `meters/hooks/register.tsx` for the `Pane` path (`/meters side`): the app, not the mod, decides where a docked pane appears, so do not promise a left side.
4. Known choices to keep or question: the 150k-token legend threshold is arbitrary; the weekly reset time was dropped from the band; weekdays Mon-Fri only (a weekend counts as Friday).
5. Commit small, push to a branch, and report what you changed and what you could not verify.

## Rules for the API (this build, Claude Code 2.1.299)
- A hook is `($, e, next)`; the module may not shadow `on`, `$` or `next`; `$` may only be used as `$.noun.method(...)` (do not pass `$` to helper functions: `claude plugin validate` rejects it).
- Bars on the desktop are SVG (`Svg` element, width/height in CSS pixels); the terminal has no `Svg`.
- A tree that does not validate is silently replaced by the engine's own drawing, so test with `$.ui.mount` and `ui.find`.


## Session 2 result (cloud session)
1. Validate + tests ran: saver 7 -> 14 tests, meters 0 -> 85. tsc strict is clean on all four band mods.
2. `meters/hooks/lib.test.ts`, `mount.test.tsx`, `behavior.test.tsx`, `bands.test.tsx` added (tests need `hooks/world.ts`). The mount test pattern from this file works as written.
3. Pane path reviewed: no side is promised; an inline (not docked) pane now draws the horizontal layout; closing the pane is remembered.
4. 150k threshold is now an option (`warnTokens`); weekday and reset-time choices kept.
5. Stacking: tested one mod at a time with a foreign tree beneath (a test may load only its own plugin folder; inline plugins go through a stricter loader that rejects the mods). Result and fix: see PROGRESS.md.
