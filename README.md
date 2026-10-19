# claude-mods

Two Claude Code mods.

| Mod | What it does |
| --- | --- |
| `saver` | Sends easy prompts (typos, renames, formatting, short summaries, quick questions) to Haiku 5.5 while context is under 100K tokens; hard ones stay on your model. A strip above the prompt shows the model that answered last and what was saved today at list prices. `/saver on`, `/saver off`. |
| `meters` | Context window (red past 80%, with a fresh-session legend), 5-hour limit and weekly limit (five 20% weekday slots) as slim meters above the prompt. `/meters side` opens a vertical side panel, `/meters top` returns to the band. Replaces the earlier `context-bar` and `usage-limits` mods. |

## Install

In a terminal Claude Code session:

```
/plugin install saver --marketplace <owner>/claude-mods
/plugin install meters --marketplace <owner>/claude-mods
```

From a shell: `claude plugin install saver --marketplace <owner>/claude-mods`.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `<owner>/claude-mods`, then add each plugin.

## Status

- Both mods pass `claude plugin validate`; `saver` has 7 passing tests.
- `meters` has no tests yet, and its SVG layout has not been seen on screen.
- Costs in `saver` use list prices and count every input-side token (cached or not) at the plain input price, so savings are an estimate.
