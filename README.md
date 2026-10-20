# claude-mods

Personal Claude Code mods, published as the `claude-mods` plugin marketplace.

| Mod | What it does |
| --- | --- |
| `cockpit` | One band above the prompt: Clawd the mascot (29 animated states, one per thing that is happening), context window, 5-hour limit, weekly limit (five weekday slots) and the **prompt cache countdown**, in one collapsed row. An arrow at the right opens the whole picture whenever you want it; it also opens by itself when something needs you. Every warning comes with the button that answers it. Also: saver (easy prompts go to Haiku 5.5), preflight (warns on main, uncommitted work, another session in the folder), prompt enhancer (✦ button and hotkey), and a chime when a turn ends. Replaces `meters`, `saver`, `preflight-guard` and `prompt-enhancer` (kept in `archive/`). |

## Install

The marketplace is called `claude-mods` (the plugin id is `cockpit@claude-mods`).

**Claude desktop app, from GitHub (no terminal):** in a local Code session click **+** next to the prompt box, **Plugins**, **Add marketplace** with `ferranserv/claude-mods`, then **Add plugin** for `cockpit`. With the Claude Code CLI: `/plugin install cockpit --marketplace ferranserv/claude-mods`. To update after a pull request is merged: see `docs/UPDATING.md` (pull the saved copy, click **Update**, start a new session). Every change bumps the plugin's version so the Update button appears.

**Moving from the four separate mods:** (1) merge the pull request; (2) pull the saved marketplace copy (`tools\update-mods.cmd`); (3) on the Plugins page remove `meters`, `saver`, `preflight-guard`, `prompt-enhancer` and `mods-manager` (and `plan-progress` if it is still there); (4) add `cockpit`; (5) start a NEW local session. Settings kept in the old plugins (saver on or off, a side panel, cache window you set) do not carry over: `/saver off`, `/meters side`, `/cache 30` again if you used them.

Cloud sessions on this repo load the mod from `.claude/settings.json`. For cloud sessions on other repos, add the marketplace in the environment's setup script.

## The band

Collapsed (default): Clawd, then Context, 5-hour, Weekly and Cache as one row of bars. Nothing is hidden, the small print is. On the right: ✦ Enhance (and ↩ to restore your draft) and the arrow ▾ / ▴.

Expanded: the full meters (warning text, the five weekday slots, what the next message costs warm vs cold), then every warning with its buttons, preflight findings, the saver line.

| Opens by itself when | Buttons offered |
| --- | --- |
| Context passes 50% (or 150k tokens), and again past 80% | New session with handoff (H), Copy handoff keep session (C), Fresh session (N) |
| Cache goes cold in under 5 minutes, or is cold | New session with handoff |
| 5-hour limit at 80% (saver off) | Turn saver on |
| 5-hour limit reached | Copy handoff (resume after the reset) |
| Weekly use ahead of pace (saver off) | Turn saver on |
| Preflight: on main, uncommitted changes, another session in the folder | New worktree, Commit checkpoint, Commit its files (see below) |

A warning that has no button to offer is not shown as text; the bar colors still say it. The arrow collapses an open band until the alert level climbs; `/cockpit open` pins it open, `/cockpit close` keeps it collapsed, `/cockpit auto` goes back to the default. Handoff buttons wait while Claude is working.

## Commands, hotkeys, options

| | |
| --- | --- |
| `/cockpit open\|close\|auto` | Pin the band open, keep it collapsed, or let it open when something needs you. |
| `/cockpit demo [state]` | Show every Clawd state (or one) for 4 seconds each; `/cockpit demo off` stops. |
| `/meters side` / `/meters top` | The same content in a side panel, or back in the band. The app decides where a docked pane goes. |
| `/newsession` | Writes a handoff brief, clears the session, pastes the brief into the fresh prompt box (review, then Enter). `/newsession paste` puts the last brief back (no clear). `/newsession brief` (also `/meters brief`, or the **Copy handoff** button) writes it into the prompt box and the clipboard WITHOUT clearing. A copy is saved in `~/.claude/handoffs/`. (`/handoff` was dropped: two skills hold that name.) |
| `/fresh` | Clears the session, no brief. |
| `/cache`, `/cache 30`, `/cache auto` | Show the window and exact time left, set it in minutes, or go back to learning it. |
| `/meters warn 5`, `/meters red 70`, `/meters tokens 50k`, `/meters limits [reset]` | Change the context warning levels from the prompt; saved across sessions. |
| `/meters status` | Which commands the app accepted. `/meters cache\|handoff\|fresh` do the same actions if a name is refused. |
| `/saver on\|off\|why`, `/saver strip active\|on\|always` | Saver on or off, why the last prompt was or was not routed, when its line shows in the collapsed band. |
| `/preflight`, `/preflight off\|on` | Check now, or turn the preflight warnings off or on. |
| `/enhance <draft>` | Rewrite a draft with fitting skills and project details. |
| Hotkeys | `meta+h` handoff, `meta+n` fresh, `meta+e` enhance, from the prompt box. Change or clear them in the options. |
| Options | `warnPercent` 50, `redPercent` 80, `warnTokens` 150000, `cacheMinutes` 60, `notifyMinutes` 5, `cacheStepMinutes` 5, `handoffKey`, `freshKey`, `sound` (the chime), `hotkey`, `model`, `maxSkills`. |

Cache window: Claude Code's API usage does not report the TTL, so the cockpit learns it. A cache hit after more than five idle minutes proves the one-hour cache; two full misses inside the hour mean the five-minute one; a model switch reports it outright. The countdown restarts when you send a message and at each request Claude makes, never on its own; it shows in 5-minute steps and rounds up.

## Clawd: what he shows

Several things can be true at once, so there is an order. Fleeting events win over lasting conditions: they play for a few seconds and the lasting state comes back by itself. Highest first.

| Order | State | When |
| --- | --- | --- |
| 1 | raised hand | a permission prompt is open |
| 2 | oops, bell, lab, love, idea, wizard, coins, unplugged | a tool failed; turn finished (plus the chime); tests passed; handoff saved; plan ready; draft enhanced; saver routed to Haiku; a connector failed to connect (3 to 6 seconds each) |
| 3 | dizzy; building, reading, browsing | the conversation is being compacted; an Edit/Write, a Read/Grep/Glob, or a WebSearch/WebFetch is running (and 1 second after) |
| 4 | walk, hello | session start; your first message (5 seconds) |
| 5 | asleep, mad, on fire, detective, frozen, hourglass, gauge low, tipsy, sleepy | 5-hour limit reached; over today's allowance; context 80%+; a preflight finding; cache cold; cache about to expire; allowance within 2%; context 50%+; 5-hour limit 80%+ |
| 6 | coffee, typing, thinking, talk, beach lounge | turn over 2 minutes; turn running; waiting for the model; a notice is up; nothing going on |

The cache states show only while Claude is idle (a running turn keeps the cache warm). The speech bubble under the row says what he is reacting to and carries the button for it; an open band shows the alert row instead, so nothing is said twice. Source of the drawings: `docs/mascot/clawd-sheet.html`.

## Limits

- Claude Code has no render site inside the prompt box, so the Enhance button sits in the band above it. The hotkey and `/enhance` work anywhere.
- The Alt hotkeys do not work reliably in the desktop app; use the buttons or the commands.
- The chime uses `afplay` on macOS and a PowerShell sound player on Windows (best effort: it needs the host to allow running commands). On Linux it plays nothing.
- Clawd animates by SVG animation in a sandboxed frame; if your build does not play it, you see the first frame of each state. `/cockpit demo` shows all 29 states, 4 seconds each (`/cockpit demo typing` for one, `/cockpit demo off` to stop). In the terminal there are no drawings: a short text face and the text row. Clawd belongs to Anthropic: personal use only.
- The Enhance sparkle is always shown (dim until you type a draft) because the desktop app may not raise draft events.

## Audit

`python3 tools/audit-sessions.py` reads your last 20 sessions locally and prints what you keep asking, what you keep commanding, and how you check work. Aggregates only.

## cockpit: the preflight rules

The preflight part: each session writes a small heartbeat file in the repo's shared git folder (`.git/preflight-guard/<session>.json`: folder, branch, working or idle, files it wrote with Edit/Write). Nothing is committed or pushed by itself. Silent when nothing applies.

| Situation | Shown | Button |
|---|---|---|
| Another live session in THIS folder | Commits will collide | New worktree (`.claude/worktrees/s-<id>-<date>`, branch `claude/...`, from HEAD) then Switch (asks Claude to run EnterWorktree) or Copy path |
| On main / master / the remote default | Edits land on the shared branch | New worktree |
| Uncommitted changes, no other session in the folder | N changes | Checkpoint commit; on main it first opens `checkpoint/...` so main is untouched |
| Other session in another folder, finished its turn, left changes | Its files | Commit its N files, then a confirm showing the branch (local only) |
| Other session still working | Info only, no button | none: committing mid-edit saves half-written files |

Click-commit rules: only files that session wrote, unless it is alone in its folder (then all changes); never `.env`, keys, certificates, databases; never pushes; the result line gives the undo command. A session silent for 15 minutes while "working" is treated as possibly closed and offered only if it recorded files. Ignored after 24 hours. `/preflight off` silences it for good.
