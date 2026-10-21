# archive

Mods retired from the marketplace but kept for later. Nothing here is listed in `.claude-plugin/marketplace.json`, so the app never offers it.

To bring one back: `git mv archive/<mod> <mod>`, add it to `.claude-plugin/marketplace.json` (name, source, description, version), bump its `version`, and re-add `<mod>@claude-mods` to `.claude/settings.json`. Its band rank in `hooks/bands.tsx` is still reserved.

| Mod | Why archived |
| --- | --- |
| `meters`, `saver`, `preflight-guard`, `prompt-enhancer`, `mods-manager` | Merged into `cockpit` (0.1.0), which replaces all of them. `mods-manager` did nothing useful in the desktop route; its update routine is now `docs/UPDATING.md`. |
| `plan-progress` | Panel above the prompt for `/goal` and task lists; not useful enough for the space. Its chime moved into `meters` (`sound` option). |
| `cockpit-idle-beach.md` | The beach-lounge idle of Clawd (palm, sun, drink), replaced by a neutral idle in cockpit 0.7.0. How to bring it back is in the file. |
