# tools

| File | What it does |
| --- | --- |
| `update-mods.cmd` | Windows: pulls the marketplace copy the Claude desktop app keeps, prints the versions now in it and tells you what to click. Run it after a pull request is merged (`docs/UPDATING.md`). |
| `mascot-sheet.ts` | `bun tools/mascot-sheet.ts` regenerates `docs/mascot/clawd-sheet.html` (every Clawd state, animated, with the pixels that fall outside the canvas counted: must be none) from the plugin's own drawing code. Run it after any drawing change. |
| `cockpit-log.py` | `python3 tools/cockpit-log.py [--days 7]` summarises the cockpit's local turn log (`~/.claude/cockpit-log/*.jsonl`, option `turnLog`): turns, aborted, routed to Haiku, tokens, cache hit rate, minutes. |
| `audit-sessions.py` | `python3 tools/audit-sessions.py [--n 20]` reads your last Claude Code sessions locally and prints what you keep asking and commanding and how you check work. Aggregates only; nothing leaves your machine. |
