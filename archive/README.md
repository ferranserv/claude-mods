# archive

Mods retired from the marketplace but kept for later. Nothing here is listed in `.claude-plugin/marketplace.json`, so the app never offers it.

To bring one back: `git mv archive/<mod> <mod>`, add it to `.claude-plugin/marketplace.json` (name, source, description, version), bump its `version`, and re-add `<mod>@claude-mods` to `.claude/settings.json`. The four band mods (`meters`, `saver`, `preflight-guard`, `prompt-enhancer`) now overlap with the cockpit (the same bars, commands and hotkeys), so do not run them next to it. They stack through `hooks/bands.tsx` with a band rank; the cockpit's own `bands.tsx` knows only its own rank (`cockpit`), so a restored band mod needs its rank added there too.

| Mod | Why archived |
| --- | --- |
| `meters` 0.4.0, `saver` 0.2.0, `preflight-guard` 0.1.2, `prompt-enhancer` 0.1.4, `mods-manager` 0.2.2 | Merged into `cockpit` (0.1.0), which replaces all of them. `mods-manager` did nothing useful in the desktop route; its update routine is now `docs/UPDATING.md`. |
| `plan-progress` 0.4.1 | Panel above the prompt for `/goal` and task lists; not useful enough for the space. Its chime moved into `meters`, and from there into `cockpit` (the `sound` option). |
| `cockpit-idle-beach.md` | The beach-lounge idle of Clawd (palm, sun, drink), replaced by a neutral idle in cockpit 0.7.0. How to bring it back is in the file. |
