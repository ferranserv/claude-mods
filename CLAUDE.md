# claude-mods: notes for Claude sessions

- Every change to a mod bumps that plugin's `version` in `<mod>/.claude-plugin/plugin.json` and regenerates `.claude-plugin/marketplace.json` (the desktop app only offers **Update** for a new version).
- Never run `claude plugin marketplace add/remove` or `claude plugin install/uninstall` with this repo as the working directory: those commands rewrite `.claude/settings.json` (once emptied it by accident). Test installs from another directory.
- End each task by reminding the owner what to do after merging the pull request (Windows, Claude desktop app): run `tools\update-mods.cmd` (or `git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull`), click **Update** on each plugin in the Plugins page, start a NEW local session. Details: `mods-manager/skills/sync-mods/SKILL.md`.
- Hooks may pass `$` only to functions declared at the top of the file; tests may load only the plugin under test; the four band mods share `hooks/bands.tsx` (keep the copies identical).
- Check a mod with `claude plugin validate <dir>` and `claude plugin test <dir>`.
