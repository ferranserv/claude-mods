# Cockpit (PR 1)

## Shape
New plugin `cockpit` (`cockpit/`), replacing `meters`, `saver`, `preflight-guard`, `prompt-enhancer` (moved to `archive/`, restorable). `mods-manager` also leaves the install list (does nothing in the desktop route) and moves to `archive/`; `tools\update-mods.cmd` and the CLAUDE.md routine stay.

Files: `hooks/register.tsx` (calls each feature's `register`), `hooks/band.tsx` (the one render hook), `hooks/meters.tsx`, `hooks/saver.tsx`, `hooks/preflight.tsx`, `hooks/enhancer.tsx`, `types/index.d.ts` (one `PluginState.cockpit`). Rule from CLAUDE.md: a hook may pass `$` only to functions declared in the same file, so each feature keeps its `$` helpers in its own file and exports only `register(on, options)`.

## Band
Collapsed (default): one row, mascot slot on the left, then chips: context %, cache countdown, 5h %, week pace, saver (when on), preflight count (when non-zero), Enhance button, expand arrow (small chevron, right edge). Never hides the core meters.
Expanded: today's full meters (bars, legend, cache cost line) plus saver detail, preflight detail and all action buttons.
Open/close: arrow toggles any time. It also opens by itself when a warning appears (context >= 50%, cache <= 5 min or cold, 5h >= 80%, allowance within 2% or over, preflight finding). If you collapse it while a warning stands, it stays collapsed until the level escalates. Choice kept in `$.store`.
Side-panel mode (`/meters side`) is kept as the same content in a pane.

## Every warning has its action (and no action without a warning)
| Warning | Action |
|---|---|
| Context >= 50% | Handoff (new session with handoff), Fresh |
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
