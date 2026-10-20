# Checking the cockpit on your screen

Everything below was tested in a cloud session without the desktop app. These are the things only your screen can confirm. About ten minutes. Start a NEW local session first.

| # | Do this | You should see | If not |
| --- | --- | --- | --- |
| 1 | Look above the prompt | Clawd on a beach (sunglasses, drink, palm) and four bars: Context, 5-hour, Weekly, Cache | Note whether the band is there at all; then `/meters status` |
| 2 | Watch Clawd for 10 seconds | He blinks and bobs; the drink moves; the waves roll | A still picture means SVG animation is not played by your build. Tell me: PR 2 then switches to timer redraws |
| 3 | `/cockpit demo` | All 29 states, 4 seconds each | Note which look wrong or cut off; `/cockpit demo off` stops it |
| 4 | Click the small arrow (right edge) | The band opens: warning text, five weekday slots, cache cost; click again to collapse | |
| 5 | `/meters warn 5` (context warning at 5%) and send any message | He gets tipsy and the band opens with Handoff, Copy handoff and Fresh buttons | `/meters limits reset` undoes it |
| 6 | Ask Claude to edit a file, then to read one, then to search the web | Hammer, then glasses and a scroll, then the browser, each for as long as the tool runs | Tell me which tools never change his look |
| 7 | Let a turn finish | Bell and the chime (about 4 seconds), then back to what he was doing | |
| 8 | Ask for something that needs a permission | He raises a hand until you answer | If never: the desktop build may not raise `tool.check` for asks |
| 9 | `/compact` | Dizzy while it runs | Same note if never |
| 10 | Make Claude run a failing command, then a passing `npm test` or `claude plugin test` | Oops, then the lab flasks | |
| 11 | `/cockpit mascot small`, then `off`, then `on` | Smaller, then gone (bubble and meters stay), then back | |
| 12 | Collapse the band while a warning is up, then raise the context past 80% | It stays collapsed, then reopens at the higher level | |
| 13 | `/cockpit close`, then `/cockpit auto` | Stays collapsed whatever the level; then back to automatic | |
| 14 | In a git folder with uncommitted files | Detective, with the preflight row and its button | |
| 15 | `/newsession` | A handoff brief lands in the prompt box; Clawd hugs himself | |

Report anything off in plain words ("the palm tree overlaps", "no animation", "arrow does nothing"); each row maps to one place in the code.

## 0.4.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 16 | Ask for something that needs a permission OK | Clipboard and pencil, not a "!" | |
| 17 | Let Claude write a handoff (`/handoff`) or press 🪄 | Clawd with glasses and quill writing | |
| 18 | Watch any state change | Each state lasts 5 s or more; no jump | |
| 19 | Trigger a bubble | It floats from Clawd; the band does not grow. If it looks wrong: `/cockpit bubble inline` | |
| 20 | Collapse and open the band | Same meters; 5h shows "Resets at"; Week shows % and "under/over" | |
| 21 | Narrow the window | Short labels, no clipped numbers, controls spread across the row | |
| 22 | Look at the right-hand controls | One 🪄 button (no sparkle), then the arrow | |
