# claude-mods

Personal Claude Code mods, published as the `claude-mods` plugin marketplace.

| Mod | What it does |
| --- | --- |
| `cockpit` | One band above the prompt: Clawd the mascot (36 animated states, one per thing that is happening), context window, 5-hour limit, weekly limit (five weekday slots) and the **prompt cache countdown**, in one row. Every warning is Clawd's speech bubble, with the button that answers it. Also: saver (easy prompts go to Haiku 5.5), preflight (warns on main, uncommitted work, another session in the folder), prompt enhancer (the wand button and `meta+e`), and a chime when a turn ends. Replaces `meters`, `saver`, `preflight-guard` and `prompt-enhancer` (kept in `archive/`). |

## Install

The marketplace is called `claude-mods` (the plugin id is `cockpit@claude-mods`).

**Claude desktop app, from GitHub (no terminal):** in a local Code session click **+** next to the prompt box, **Plugins**, **Add marketplace** with `ferranserv/claude-mods`, then **Add plugin** for `cockpit`. With the Claude Code CLI: `/plugin install cockpit --marketplace ferranserv/claude-mods`. To update after a pull request is merged: see `docs/UPDATING.md` (pull the saved copy, click **Update**, start a new session). Every change bumps the plugin's version so the Update button appears.

**Moving from the four separate mods:** (1) merge the pull request; (2) pull the saved marketplace copy (`tools\update-mods.cmd`); (3) on the Plugins page remove `meters`, `saver`, `preflight-guard`, `prompt-enhancer` and `mods-manager` (and `plan-progress` if it is still there); (4) add `cockpit`; (5) start a NEW local session. Settings kept in the old plugins (saver on or off, a side panel, cache window you set) do not carry over: `/saver off`, `/meters side`, `/cache 30` again if you used them.

Cloud sessions on this repo load the mod from `.claude/settings.json`. For cloud sessions on other repos, add the marketplace in the environment's setup script.

## The band

One row, always: Clawd, then Context, 5-hour, Weekly and Cache as bars. Every number is always visible; nothing expands or collapses. On the right, two small square buttons with a thin outline: the **wand** (Enhance your draft; it dims while there is no draft and turns green while it works) and, after an Enhance, the **return arrow** (restore your original draft). The whole square is the click area.

Everything the cockpit has to tell you is Clawd's **bubble**, in a row under the meters (it never covers a number). It has one gray button of its own and, when there are more answers, a **…** that opens them in a row below.

| Clawd says | Button on the bubble | Behind the … |
| --- | --- | --- |
| Context past 50%, past 80% | Copy handoff (writes the brief and copies it, the session stays) | Handoff (new session), Compact, Fresh |
| Cache about to go cold, or cold | Copy handoff | Writes the brief into your prompt box and copies it; never clears the session |
| 5-hour limit at 80% (saver off) | Saver on | |
| 5-hour limit reached | Copy handoff | |
| Weekly use ahead of pace (saver off) | Saver on | |
| Preflight: on main, uncommitted changes, another session in the folder | New worktree / Commit checkpoint / Commit its files | the other findings, Hide all |
| A notice (worktree ready, committed) | Switch / OK | Copy path, OK, Copy undo command |
| Saver routed a step to Haiku | | |
| Messages (busy, failed, done) | | |

Handoff buttons wait while Claude is working. `/cockpit log` lists the last ten things the bubble said.

## Commands, hotkeys, options

| | |
| --- | --- |
| `/cockpit log` | The last ten things the bubble said, and the last handoff brief's path. |
| `/cockpit demo [state]` | Show every Clawd state (or one) for 4 seconds each; `/cockpit demo off` stops. |
| `/cockpit mascot on\|small\|off` | Clawd at full size (68 x 56 px), half size, or hidden (the bubble and meters stay). Remembered across sessions. |
| `/meters side` / `/meters top` | The same content in a side panel, or back in the band. The app decides where a docked pane goes. |
| `/newsession` | Writes a handoff brief, clears the session, pastes the brief into the fresh prompt box (review, then Enter). `/newsession paste` puts the last brief back (no clear). `/newsession brief` (also `/meters brief`, or the **Copy handoff** button) writes it into the prompt box and the clipboard WITHOUT clearing. A copy is saved in `~/.claude/handoffs/`. (`/handoff` was dropped: two skills hold that name.) |
| `/fresh` | Clears the session, no brief. |
| `/cache`, `/cache 30`, `/cache auto` | Show the window and exact time left, set it in minutes, or go back to learning it. |
| `/meters warn 5`, `/meters red 70`, `/meters tokens 50k`, `/meters limits [reset]` | Change the context warning levels from the prompt; saved across sessions. |
| `/meters status` | Which commands the app accepted. `/meters cache\|handoff\|fresh` do the same actions if a name is refused. |
| `/saver on\|off\|why` | Saver on or off, and why the last prompt was or was not routed. When it routes a step, Clawd says so in the bubble. |
| `/preflight`, `/preflight off\|on` | Check now, or turn the preflight warnings off or on. |
| `/enhance <draft>` | Rewrite a draft with fitting skills and project details. |
| Hotkeys | `meta+h` handoff, `meta+n` fresh, `meta+e` enhance, from the prompt box. Change or clear them in the options. |
| Options | `warnPercent` 50, `redPercent` 80, `warnTokens` 0 (off; a size warning in tokens if you want one), `cacheMinutes` 60, `notifyMinutes` 5, `cacheStepMinutes` 5, `mascot` (normal, small, off), `handoffKey`, `freshKey`, `sound` (the chime), `turnLog`, `hotkey`, `model`, `enhanceStyle` (full or lean), `maxSkills`, `askSeconds` (how long a question waits before the raised hand, 5). |

Cache window: Claude Code's API usage does not report the TTL, so the cockpit learns it. A cache hit after more than five idle minutes proves the one-hour cache; two full misses inside the hour mean the five-minute one; a model switch reports it outright. The countdown restarts when you send a message and at each request Claude makes, never on its own; it shows in 5-minute steps and rounds up.

## Clawd: what he shows

Several things can be true at once, so there are three levels and an order inside each. Highest first.

| Level | States | When |
| --- | --- | --- |
| 1. Needs you now | raised hand, writing, idea | Claude asked you a question or a plan waits for approval; a handoff or an enhanced draft is being written; the plan was approved |
| 2. The task (only while Claude works) | oops, boom, lab, ship, plug, dizzy; creating, building, reading, browsing, **mcp** (a connector's tool: he plugs the two halves of the cable together, happy, and waves go out), **running**; coffee; typing; thinking | a tool failed; a check failed (the flask blows up); a check passed; a commit, push or pull request went out; a connector failed; the conversation is being compacted; Claude is writing a file, editing, reading, searching the web, or a shell command has run 2 seconds (checks, installs and builds count at once; typing with green code scrolling behind him); 7 minutes of work (coffee, for 6 seconds at a time); any other tool; waiting for the model |
| 3. Session and your own actions | walk, hello, love, wizard | session start; your first message; handoff saved; draft enhanced (5 seconds each) |
| 4. When the turn is over | bell, coins, then a notice (talk), then the status alerts | the turn finished (plus the chime); the saver kept money; a notice is up; then, in turns of 6 seconds, worst first (but asleep, the 5-hour limit reached, is the only one while it lasts): asleep, mad (over today's allowance), on fire (context 80%+), allowance within 2%, sleepy (5-hour 80%+), tipsy (context 50%+), frozen (cache cold), hourglass (cache about to expire), detective (a preflight finding), unplugged (a connector is down); none left: **fishing** while a background task (a command run in the background, or an agent) is still running, else idle (sunglasses) |

No status alert shows while Claude works, and the cache states show only while it is idle (a running turn keeps the cache warm). **Fishing** is Clawd in a bucket hat who puts a worm on the hook, casts, waits a long time on a thin ripple of water, reels in, finds the worm gone, shrugs and starts again (about 23 s a round). `running` is `typing` with lines of code scrolling behind him; the code starts after he opens his laptop and is gone before he closes it.

The speech bubble is a gray pixel bubble in the row under the meters, beside Clawd, with its button at the right. It says what he is reacting to and carries the button for it. A state stays at least 5 seconds unless something more important arrives; a change plays a short move (hand-drawn for the common pairs, a morph for the rest). When Claude writes into your prompt box (handoff brief, enhancer) he puts on glasses and writes with a quill; a question from Claude (or a plan to approve) shows a clipboard and pencil and a raised hand. Click Clawd to show or hide his bubble: in any pose he has something to say (the pose's own bubble, a notice, or a light line of his own, a different one each click), and the bubble leaves the way it came: its words are deleted letter by letter, the bubble shortens with them, then it shrinks back into him and fades (the same when a bubble expires by itself). Source of the drawings: `docs/mascot/clawd-sheet.html`.

## Limits

- Claude Code has no render site inside the prompt box, so the wand button sits in the band above it. The hotkey and `/enhance` work anywhere.
- The Alt hotkeys do not work reliably in the desktop app; use the buttons or the commands.
- The chime uses `afplay` on macOS and a PowerShell sound player on Windows (best effort: it needs the host to allow running commands). On Linux it plays nothing.
- Clawd animates by SVG animation in a sandboxed frame; if your build does not play it, you see the first frame of each state. `/cockpit demo` shows all 35 states, 4 seconds each (`/cockpit demo typing` for one, `/cockpit demo off` to stop). In the terminal there are no drawings: a short text face and the text row. Clawd belongs to Anthropic: personal use only.
- The wand is always shown (dim until you type a draft) because the desktop app may not raise draft events.

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

## Checking it on your screen

`docs/VERIFY.md` is a ten-minute checklist of what only the desktop app can confirm.
