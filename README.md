# claude-mods

Personal Claude Code mods, published as the `claude-mods` plugin marketplace.

| Mod | What it does |
| --- | --- |
| `plan-progress` | Panel above the prompt for multi-step work and `/goal`: goal, phase (researching, planning, building, testing, auditing), task checklist, progress bar with %, elapsed time. Chime when a turn ends. Zero model calls, zero extra tokens. |
| `prompt-enhancer` | Sparkle Enhance button + hotkey (`meta+e`) + `/enhance`. Rewrites your draft in place: fitting skills, project details, questions to answer first, what done looks like. One small-model call per use; undo button restores your draft. |
| `mods-manager` | At each session start (at most hourly) runs `git pull --ff-only` in the folder the mods are installed from, so a merged pull request reaches the next session by itself; `/updatemods` does it now. Also the skill `sync-mods`: after you build a mod, it lands in `~/mods`, the marketplace file is rebuilt, and the mod is installed for every session. |
| `saver` | Sends easy prompts (typos, renames, formatting, short summaries, quick questions) to Haiku 5.5 while context is under 100K tokens; hard ones stay on your model. A strip above the prompt shows the model that answered last and what was saved today at list prices. `/saver on`, `/saver off`. |
| `meters` | One band above the prompt (or a vertical side panel): context window, 5-hour limit, weekly limit (five weekday slots) and the **prompt cache countdown**. Context turns orange from 50% (or 150k tokens) with a "quality may start to slip" warning and red past 80%. Warns you before the cache goes cold, shows what the next message costs warm vs cold, and offers **New session with handoff** and **Fresh session** buttons, hotkeys, `/handoff`, `/fresh`, `/cache`. `/meters side` / `/meters top` move it. Replaces the earlier `context-bar` and `usage-limits` mods. |

## Install

The marketplace is called `claude-mods` (plugin ids look like `meters@claude-mods`). It was called `my-mods` until 2026-10-19; an old local `my-mods` marketplace must be removed first (see below), or the app can keep reading its stale folder.

**Claude desktop app, from GitHub (recommended, no terminal):** in a local Code session click **+** next to the prompt box, **Plugins**, **Add marketplace** with `ferranserv/claude-mods`, then **Add plugin** for `meters`, `saver`, `plan-progress` and `prompt-enhancer` (`mods-manager` is only for the CLI flow below and does nothing useful installed this way). To update after a pull request is merged: open the Plugins page and click **Update** on each plugin that offers it, then start a new session. Every change bumps the plugin's version so the Update button appears.

**Moving from the old `my-mods` install:** (1) merge the pull request that renamed the marketplace; (2) in the Plugins page remove the `my-mods` marketplace and its plugins; (3) optionally delete or rename the old local clone (`C:\Users\<you>\mods`); (4) add `ferranserv/claude-mods` as above.

**With the Claude Code CLI** (macOS/Linux, or Windows with Git Bash and Python), as an alternative that installs from a local clone:

```bash
git clone https://github.com/ferranserv/claude-mods ~/mods
bash ~/mods/mods-manager/skills/sync-mods/sync.sh --install-hook
```

That registers `~/mods` as the `claude-mods` marketplace, installs every mod at user scope, and adds a SessionStart hook so mods you drop in later install themselves. Check with `/plugin` (or `claude plugin list`). Use either the GitHub marketplace or the local clone, not both: they share a name.

Cloud sessions on this repo load the mods from `.claude/settings.json`. For cloud sessions on other repos, put the install lines above in the environment's setup script.

## Keeping the mods current

- **Installed from GitHub (the desktop app route above):** the app keeps its own saved copy of the repo and does not refresh it. After each merge run `tools\update-mods.cmd` from that copy (`%USERPROFILE%\.claude\plugins\marketplaces\claude-mods\tools\update-mods.cmd`), or `git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull`, then click **Update** on the Plugins page and start a new session. Deleting and reinstalling plugins alone re-reads the stale copy. The same steps are in the `sync-mods` skill (`mods-manager`) and in `CLAUDE.md`.
- **Installed from a local clone (CLI route):** `mods-manager` (0.2.0+) runs `git pull --ff-only` in that folder at session start (at most hourly), shows "Mods updated to <commit>. Start a new session to load them.", and `/updatemods` does it now. It only works where the app lets a mod run `git`; elsewhere it says so once. Manual fallback: `git -C "$env:USERPROFILE\mods" pull`, then a new session. Turn it off with the `autoUpdate` option. When the mods come from GitHub, the folder is not a git clone and it does nothing.
- Anything merged to `main` is loaded from then on: the merge is the gate.

## New mods

Build the mod (it lands in `~/.claude/dev-mods/<session>/<mod>`), then run the `sync-mods` skill. Commit with `sync.sh --commit`, push with `git -C ~/mods push`.

If you also keep the hot-reloaded dev copy enabled, a mod can load twice in that session. Disable one.

## meters: commands, hotkeys, options

| | |
| --- | --- |
| `/meters side` / `/meters top` | Side panel, or back to the band. The app decides where a docked pane goes; no side is promised. Closing the panel with its own mark is remembered. |
| `/handoff` | Writes a handoff brief, clears the session, pastes the brief into the fresh prompt box (review, then Enter). `/handoff paste` puts the last brief back in the prompt box (no clear). A copy is saved in `~/.claude/handoffs/`. |
| `/fresh` | Clears the session, no brief. |
| `/newsession` | Same as `/handoff`, for setups where `/handoff` already belongs to another skill. |
| `/meters warn 5`, `/meters red 70`, `/meters tokens 50k`, `/meters limits [reset]` | Change the context warning levels (orange / red / by size) from the prompt, no options screen needed; saved across sessions. |
| `/meters status` | Lists which of the commands above the app accepted, and which it refused. |
| `/meters cache`, `/meters handoff`, `/meters fresh` | The same actions through `/meters`, which always registers first: use them if the app refuses a command name. |
| `/cache`, `/cache 30`, `/cache auto` | Show the window and exact time left, set the window in minutes, or go back to learning it. |
| Cache countdown | Resets to the full window the moment you send a message (and at each request Claude makes), never on its own. The band shows it in 5-minute steps (`55m`, `50m`, … `<5m`, `cold`) and redraws only when that changes; `cacheStepMinutes` changes the step. The going-cold notice still fires exactly `notifyMinutes` before the end. |
| Buttons | **New session with handoff** (H) and **Fresh session** (N) appear under the bars once the context is at the first warning and Claude is idle. H / N work while the band has focus (ctrl+x tab). |
| Hotkeys | `meta+h` handoff, `meta+n` fresh, from the prompt box. Change or clear them in the mod's options. |
| Options | `warnPercent` 50, `redPercent` 80, `warnTokens` 150000, `cacheMinutes` 60, `notifyMinutes` 5, `handoffKey`, `freshKey`. |

Cache window: Claude Code's API usage does not report the TTL, so `meters` learns it. A cache hit after more than five idle minutes proves the one-hour cache; two full misses inside the hour mean the five-minute one; a model switch reports it outright. Until then (and whenever you set one with `/cache`) it uses 60 minutes. Cost of the next message is input-side only, at list price: cache read 0.1x when warm, cache write 1.25x (5 min) or 2x (1 hour) when cold. The handoff brief is written by a fork of the session (nearly free) while the cache is warm and by a small model over the transcript tail when it is cold.

## Band order

`meters`, `saver`, `plan-progress` and `prompt-enhancer` all draw in the band above the prompt. Each takes what is beneath it, tags its own tree `band:<rank>:<name>` and returns `stack(...)` from its own copy of `hooks/bands.tsx`, which sorts by rank: plan-progress (10), meters (20), saver (30), prompt-enhancer (40). The order on screen is the same whichever mod the engine calls first. Keep the four copies of `bands.tsx` identical. A mod outside the contract stays on top.

## Limits

- Claude Code has no render site inside the prompt box, so the Enhance button sits in a band directly above it, right-aligned. The hotkey and `/enhance` work anywhere.
- Hotkey `meta+e` is Option+E on macOS only when the terminal sends Option as Meta. Change it in the mod's options.
- The chime uses `afplay` on macOS and a PowerShell sound player on Windows (best effort: it needs the host to allow running commands). On Linux it plays nothing.
- `plan-progress` shows only for a `/goal` or a task list of 2+ steps, so it is invisible in an ordinary chat. The ✕ on the panel or `/plan-reset` clears it; `/plan-debug` lists the tool names it has seen (use it when the checklist stays empty). It is drawn as SVG on the desktop, text in a terminal.
- `saver`: the strip is hidden unless saver is on AND the last answer was routed to Haiku. `/saver strip on` shows it whenever saver is on, `/saver strip always` even when off, `/saver strip active` is the default. `/saver why` says why the last prompt did or did not go to Haiku. Nothing is routed when your session model is already Haiku.
- The rule above the saver strip belongs to `saver` (its own band, rank 25) and shows only when the strip does.
- `/handoff` is held by Anthropic skills (`handoff`, `design:design-handoff`) and is refused here; use `/newsession` or `/meters handoff`.
- The cache label rounds UP to the step (60m right after a message), so it can read up to 5 minutes more than is left; `/cache` is exact.
- The Enhance sparkle is always shown above the prompt (dim until you type a draft); `/enhance <draft>` works too.

## Audit

`python3 tools/audit-sessions.py` reads your last 20 sessions locally and prints what you keep asking, what you keep commanding, and how you check work. Aggregates only.
