# archive

Mods retired from the marketplace but kept for later. Nothing here is listed in `.claude-plugin/marketplace.json`, so the app never offers it.

To bring one back: `git mv archive/<mod> <mod>`, add it to `.claude-plugin/marketplace.json` (name, source, description, version), bump its `version`, and re-add `<mod>@claude-mods` to `.claude/settings.json`. Its band rank in `hooks/bands.tsx` is still reserved.

| Mod | Why archived |
| --- | --- |
| `plan-progress` | Panel above the prompt for `/goal` and task lists; not useful enough for the space. Its chime moved into `meters` (`sound` option). |
