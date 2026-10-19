# claude-mods

Personal Claude Code mods, published as the `my-mods` plugin marketplace.

| Mod | What it does |
| --- | --- |
| `plan-progress` | Panel above the prompt for multi-step work and `/goal`: goal, phase (researching, planning, building, testing, auditing), task checklist, progress bar with %, elapsed time. Chime when a turn ends. Zero model calls, zero extra tokens. |
| `prompt-enhancer` | Sparkle Enhance button + hotkey (`meta+e`) + `/enhance`. Rewrites your draft in place: fitting skills, project details, questions to answer first, what done looks like. One small-model call per use; undo button restores your draft. |
| `mods-manager` | Skill `sync-mods`: after you build a mod, it lands in `~/mods`, the marketplace file is rebuilt, and the mod is installed for every session. |
| `saver` | Sends easy prompts (typos, renames, formatting, short summaries, quick questions) to Haiku 5.5 while context is under 100K tokens; hard ones stay on your model. A strip above the prompt shows the model that answered last and what was saved today at list prices. `/saver on`, `/saver off`. |
| `meters` | Context window (red past 80%, with a fresh-session legend), 5-hour limit and weekly limit (five 20% weekday slots) as slim meters above the prompt; `/meters side` opens a vertical side panel, `/meters top` returns to the band. Replaces the earlier `context-bar` and `usage-limits` mods. |

## Install on your machine

```bash
git clone https://github.com/ferranserv/claude-mods ~/mods
bash ~/mods/mods-manager/skills/sync-mods/sync.sh --install-hook
```

That registers `~/mods` as the `my-mods` marketplace, installs every mod at user scope, and adds a SessionStart hook so mods you drop in later install themselves. Check with `/plugin` (or `claude plugin list`).

Without cloning: `/plugin install plan-progress --marketplace ferranserv/claude-mods`.

Cloud sessions on this repo load the mods from `.claude/settings.json`. For cloud sessions on other repos, put the two install lines above in the environment's setup script.

## New mods

Build the mod (it lands in `~/.claude/dev-mods/<session>/<mod>`), then run the `sync-mods` skill. Commit with `sync.sh --commit`, push with `git -C ~/mods push`.

If you also keep the hot-reloaded dev copy enabled, a mod can load twice in that session. Disable one.

## Status of saver and meters

- Both pass `claude plugin validate`; `saver` has 7 passing tests (`saver/hooks/lib.test.ts`). `meters` has no tests yet and its SVG layout has not been seen on screen.
- `saver` costs use list prices and count every input-side token (cached or not) at the plain input price, so savings are an estimate.
- `meters`, `plan-progress` and `prompt-enhancer` all draw in the band above the prompt; whether they stack cleanly has not been tested. See `HANDOFF.md`.

## Limits

- Claude Code has no render site inside the prompt box, so the Enhance button sits in a band directly above it, right-aligned. The hotkey and `/enhance` work anywhere.
- Hotkey `meta+e` is Option+E on macOS only when the terminal sends Option as Meta. Change it in the mod's options.
- The chime uses `afplay` (macOS). On Linux/Windows the hook runs and plays nothing.

## Audit

`python3 tools/audit-sessions.py` reads your last 20 sessions locally and prints what you keep asking, what you keep commanding, and how you check work. Aggregates only.
