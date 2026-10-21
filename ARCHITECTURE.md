# ARCHITECTURE

| Prompt topic | Files to read |
|---|---|
| Cockpit band, merge, expand, warnings and actions | docs/COCKPIT.md |
| Mascot states, priority, sprite spec, animation | docs/MASCOT.md, cockpit/hooks/mood.ts, cockpit/hooks/states.ts |
| What to check on screen | docs/VERIFY.md |
| Mascot sprite source | cockpit/hooks/sprite.ts; the browsable sheet is generated: `bun tools/mascot-sheet.ts` -> docs/mascot/clawd-sheet.html |
| Band stacking contract (old four mods) | README.md "Band order", `meters/hooks/bands.tsx` |
| Update routine after a merge | CLAUDE.md, `mods-manager/skills/sync-mods/SKILL.md` |
| Plugin API / hook rules | the `plugin-authoring` skill and its `reference.md` |

The cockpit replaces four plugins with one. Features stay in separate files (`meters`, `saver`, `preflight`, `enhancer`) but share one `$.state.cockpit` contract, so the band can read all of them. The mascot is a renderer on top of that state: it never owns state of its own.
