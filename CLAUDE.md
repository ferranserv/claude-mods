# claude-mods: notes for Claude sessions

One mod ships from this repo: `cockpit` (the band above the prompt with Clawd). Read `README.md` for what it does and `ARCHITECTURE.md` for where things are.

- Every change to a mod bumps that plugin's `version` in `<mod>/.claude-plugin/plugin.json` and the same version in `.claude-plugin/marketplace.json` (the desktop app only offers **Update** for a new version).
- Never run `claude plugin marketplace add/remove` or `claude plugin install/uninstall` with this repo as the working directory: those commands rewrite `.claude/settings.json` (once emptied it by accident). Test installs from another directory.
- End each task by reminding the owner what to do after merging the pull request (Windows, Claude desktop app): run `tools\update-mods.cmd` (or `git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull`), click **Update** on each plugin in the Plugins page, start a NEW local session. Details: `docs/UPDATING.md`.
- Check a mod with `claude plugin validate cockpit` and `claude plugin test cockpit` (run them from a directory outside the repo, e.g. `cd /tmp`). `bun test` does not work: the tests import `claude-code/testing`, which only the plugin engine provides.
- Hooks may pass `$` only to functions declared in the same file, and one event can be hooked once per plugin (a second `on('turn.start')` fails validation): all of the cockpit's `$` code therefore lives in `cockpit/hooks/register.tsx`, in sections (meters, saver, preflight, enhancer, band, wiring). Pure code goes in the other files of `hooks/`. Tests may load only the plugin under test.
- Every clickable drawing is a press target (`pressTarget` in `register.tsx`): a drawing with a Client laid over it at 100% of its box (`hooks/press.tsx`), and the engine only finds a Client when the source CALLS it with a literal module path. Never lay a `Button` over a drawing (the desktop draws every Button natively, one line tall). The terminal has no drawings and keeps plain Buttons.
- Mascot: after ANY drawing change run `bun tools/mascot-sheet.ts` (regenerates `docs/mascot/clawd-sheet.html`, which must show no "px cut"). Never draw floors or full-width scenery in a mascot state (it gets cut off). The Svg limit is 131072 characters per drawing.
- When something the user sees changes, also update: `README.md` (what it does), `docs/MASCOT.md` (the dated entry for the version), `docs/VERIFY.md` (a row for what only the desktop app can confirm), `PROGRESS.md` (one line). `docs/COCKPIT.md` is the design record: add an entry, never rewrite old ones (mark them superseded).
- Retired mods live in `archive/` (see `archive/README.md`); nothing there is listed in the marketplace.
- Work on a `claude/...` branch and open a pull request. Merge only when the owner asks.
- The owner writes in Spanish; the repo's docs, code and commits are in English.
