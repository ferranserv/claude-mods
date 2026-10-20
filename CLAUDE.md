# claude-mods: notes for Claude sessions

- Every change to a mod bumps that plugin's `version` in `<mod>/.claude-plugin/plugin.json` and regenerates `.claude-plugin/marketplace.json` (the desktop app only offers **Update** for a new version).
- Never run `claude plugin marketplace add/remove` or `claude plugin install/uninstall` with this repo as the working directory: those commands rewrite `.claude/settings.json` (once emptied it by accident). Test installs from another directory.
- End each task by reminding the owner what to do after merging the pull request (Windows, Claude desktop app): run `tools\update-mods.cmd` (or `git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull`), click **Update** on each plugin in the Plugins page, start a NEW local session. Details: `docs/UPDATING.md`.
- Hooks may pass `$` only to functions declared in the same file, and one event can be hooked once per plugin (a second `on('turn.start')` fails validation): all of the cockpit's `$` code therefore lives in `cockpit/hooks/register.tsx`, in sections (meters, saver, preflight, enhancer, band). Pure code goes in the other files of `hooks/`. Tests may load only the plugin under test.
- Retired mods live in `archive/` (see `archive/README.md`); nothing there is listed in the marketplace.
- Design docs: `ARCHITECTURE.md` (index), `docs/COCKPIT.md`, `docs/MASCOT.md`. Never draw floors or full-width scenery in a mascot state (it gets cut off).
- Check a mod with `claude plugin validate <dir>` and `claude plugin test <dir>`.
