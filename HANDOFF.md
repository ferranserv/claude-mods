# HANDOFF for a new session: claude-mods (updated 2026-10-22)

You are continuing work on one Claude Code mod, `cockpit`, in `ferranserv/claude-mods` (branch `main`). A cloud session cannot see the owner's screen: everything you need is in this repo. Paths are relative to the repo root. Read `CLAUDE.md` first (rules for this repo), then `REQUEST.md` (goal, constraints, what is open) and `PROGRESS.md` (history, newest last).

## What exists
- `cockpit/` (version in `cockpit/.claude-plugin/plugin.json`, mirrored in `.claude-plugin/marketplace.json`): the band above the prompt. Clawd (34 animated states), Context / 5-hour / Weekly / Cache meters, a speech bubble with the button for each warning, saver, preflight, prompt enhancer (wand and Undo), handoff, chime, turn log. What it does for a user: `README.md`.
- `archive/`: the four mods it replaced, `mods-manager`, `plan-progress`, and the beach idle (`archive/README.md`).
- `docs/`: `COCKPIT.md` (design record, one section per version), `MASCOT.md` (Clawd: states, hierarchy, drawing rules, a dated entry per version), `VERIFY.md` (what only the desktop app can confirm), `UPDATING.md`, `mascot/clawd-sheet.html` (generated).
- `tools/`: see `tools/README.md`.
- Where each thing lives in the code: `ARCHITECTURE.md`.

## How to work
1. Branch `claude/...`, change, run `claude plugin validate cockpit` and `claude plugin test cockpit` (from outside the repo directory, e.g. `cd /tmp`). The suite is about 275 tests and takes ~25 s.
2. After any drawing change: `bun tools/mascot-sheet.ts` (no "px cut" may show).
3. Bump the version in both JSON files, add the dated entries (docs/MASCOT.md, PROGRESS.md, VERIFY.md row if the screen shows something new), commit, push, open a pull request. Merge only when the owner says so.
4. End by telling the owner the three steps after the merge (CLAUDE.md).

## Rules for the API (this build)
- A hook is `($, e, next)`; the module may not shadow `on`, `$` or `next`; `$` is used only as `$.noun.method(...)` and never passed to a function from another file. One hook per event per plugin.
- Drawings are `Svg` elements (width and height in CSS px) and only exist on the desktop; the terminal gets text. A tree that does not validate is silently replaced by the engine's own drawing, so test with `$.ui.mount` and `ui.find` / `ui.findAll`.
- A clickable drawing is a press target (a Client laid over it, called with a literal module path); never a Button over a drawing.
- Tests may load only the plugin under test (`hooks/world.ts` is the shared fake world).

## Open
See `REQUEST.md` (sharing: license and Anthropic's terms for Clawd; what no cloud session can verify). Ideas the owner has not asked for are not started.
