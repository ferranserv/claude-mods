# ARCHITECTURE

| Prompt topic | Files to read |
|---|---|
| What the cockpit does, install, commands, options, Clawd's states | README.md |
| Cockpit design history (band, bubble lane, buttons, accounting), one section per version | docs/COCKPIT.md |
| Mascot states, priority, sprite spec, animation, moves, press targets | docs/MASCOT.md, cockpit/hooks/mood.ts, cockpit/hooks/states.ts, cockpit/hooks/sprite.ts |
| What to check on screen (only the desktop app can confirm it) | docs/VERIFY.md |
| Updating after a merge (Windows desktop app) | docs/UPDATING.md, tools/update-mods.cmd, CLAUDE.md |
| The browsable sprite sheet | generated: `bun tools/mascot-sheet.ts` -> docs/mascot/clawd-sheet.html |
| Band stacking contract (one rank, `cockpit`) | cockpit/hooks/bands.tsx |
| Retired mods and how to bring one back | archive/README.md |
| Plugin API / hook rules | the `plugin-authoring` skill and its `reference.md` |
| Where the owner stands and what is open | REQUEST.md, HANDOFF.md, PROGRESS.md |

The repo ships one plugin, `cockpit` (it replaced `meters`, `saver`, `preflight-guard` and `prompt-enhancer`). Layout of `cockpit/`:

- `hooks/register.tsx`: every hook and every function that takes `$`, in sections (meters, saver, preflight, enhancer, band, wiring). The engine allows one hook per event and `$` only inside the file that uses it, so this file is long on purpose.
- Pure code (no `$`): `lib.ts` (numbers, SVG for meters, bubble, pills, wand and Undo squares), `mood.ts` (which state Clawd shows and what he says), `states.ts` (his frames, moves between states, how code fades), `sprite.ts` (the drawing on a 34 x 28 px grid), `saver-logic.ts`, `preflight-logic.ts`, `enhancer-logic.ts`, `handoff.ts`, `turnlog.ts`, `keys.ts`, `bands.tsx`.
- `hooks/press.tsx`: the empty click region laid over every drawing that is a button (a Client module; no `$`).
- Tests sit beside the code (`*.test.ts(x)`); `world.ts` is their shared fake world. Run them with `claude plugin test cockpit`.
- `types/index.d.ts`: the state contract (self-contained: an import is refused). `sounds/done.wav`: the chime. `tsconfig.json` extends a file the engine generates (git-ignored).

The mascot is a renderer on top of the cockpit's state: it never owns state of its own. Signals flow one way: hooks leave facts in `mood` (register.tsx), `pickState` (mood.ts) chooses the pose, `states.ts` draws it and the move from the one before, `bandTree` lays it out.
