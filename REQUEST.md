# REQUEST

Owner: Ferran (Efform, Operational Transformation). Repo: ferranserv/claude-mods. Claude desktop app on Windows, local sessions. The owner writes in Spanish and works by short rounds: a change, a look on screen, the next change.

## Goal
One band above the prompt instead of four strips, with a mascot (Clawd) that shows what is happening, and no warning without the action that answers it. One plugin: `cockpit`.

## Status (cockpit 0.27.x, shipped)
- Meters (context, 5-hour, weekly, cache countdown), saver (easy prompts to Haiku 5.5), preflight (main, dirty tree, parallel sessions), prompt enhancer (wand and Undo squares, `meta+e`), handoff, chime, turn log: all inside `cockpit`. The old four mods are in `archive/`.
- Clawd: 34 states, a speech bubble that is the only channel for messages, hand-drawn moves between states. Latest: `running` (typing with green code scrolling behind him while a shell command runs).
- What it does today: `README.md`. How it got here: `docs/COCKPIT.md`, `docs/MASCOT.md`, `PROGRESS.md`.

## Not wanted
An exceptions-only view, turn-timer or toast extras (the mascot covers them), a daily money glance, scenery that spans the whole canvas (it gets cut off), a Button laid over a drawing.

## Constraints
- No model calls where avoidable (the enhancer's one call is the exception).
- Bump `version` in `cockpit/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` on every change, or the app never offers **Update**.
- The owner checks each change on the desktop app; a cloud session cannot see it (`docs/VERIFY.md` lists what only the app can confirm).

## Success
`claude plugin validate cockpit` and `claude plugin test cockpit` pass; the owner confirms on screen; one step to update after a merge (`docs/UPDATING.md`).

## Open
- The owner is about to share the mod. There is no LICENSE file; Clawd belongs to Anthropic (`docs/MASCOT.md`), so check Anthropic's brand terms and say in the README what may be reused.
- Not seen by any cloud session: how SMIL animation, the code behind `running` and the buttons look on the real band, and whether a state change shows a brief flash when the host replaces Clawd's drawing.
