# REQUEST

Owner: Ferran (Efform, Operational Transformation). Repo: ferranserv/claude-mods. Desktop app on Windows, local sessions.

## Done (sessions 1-6)
Mods `meters`, `saver`, `preflight-guard`, `prompt-enhancer` shipped; `plan-progress` archived (its chime now in `meters` 0.4.0). History: PROGRESS.md.

## Now: the Cockpit (decided 2026-10-20)
Goal: one band above the prompt instead of four strips, with a mascot (Clawd) that shows state, and no warning without an action.
1. PR 1 (built, awaiting the owner's check on screen), plugin `cockpit`: merges meters + saver + preflight-guard + prompt-enhancer; collapsed row always shows the core meters, arrow expands everything, auto-opens when something needs you; every warning carries its action; trims. Old four archived.
2. PR 2, mascot: Clawd with 18 animated states, speech bubble, bell on turn finish.
3. PR 3, polish from the owner's screenshots.
Not wanted: exceptions-only view, turn-timer/toast extras (mascot covers it), daily money glance.
Constraints: no model calls where avoidable; each PR verified by the owner on the app before the next; bump versions and regenerate the marketplace file on every mod change.
Success: owner confirms on screen; `claude plugin validate|test` pass; one reinstall step only.
Design: ARCHITECTURE.md (INDEX) -> docs/COCKPIT.md, docs/MASCOT.md.
