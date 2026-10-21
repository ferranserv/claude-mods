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

## 0.5.x additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 23 | Send a prompt from idle | Sunglasses come off, then the thinking pose (not a fade) | |
| 24 | Run an Edit, then a Read | Laptop away, hard hat and hammer (Edit); glasses and scroll (Read); and back to typing | |
| 25 | Make a tool fail | Hands up and "!" (oops), then back to the laptop | |
| 26 | Finish a turn | Typing, then the bell, then back to the beach with sunglasses | |
| 27 | Raise a permission prompt | The clipboard appears after about 2.5 s, not at once | |
| 28 | Any other state change | A short morph: he drops what he holds, then picks up the next thing | |
| 29 | Trigger a bubble | A white pixel bubble with a dark border above Clawd, regular text, button beside it. The band moves down while it shows | |
| 30 | Look at the wand | Flat, single colour, white; clicking it enhances the draft | |
| 31 | Watch each state for a few seconds | Every state moves: hops, sways, shivers, stomps | |

## 0.7.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 32 | Look at Clawd with nothing going on | Neutral, sunglasses only; no palm, sun or drink | |
| 33 | Read a file (and from idle, from typing, from anything) | Glasses come on, a stack of books appears beside him, an open book in front; no abrupt pop | |
| 34 | Send a prompt from idle that starts a tool | Sunglasses off, then the laptop, hat or book (idle > typing, building, reading) | |
| 35 | Trigger a bubble (a warning, a tool failure) | Grey pixel bubble over the meters; the band does not grow; the button sits beside it in grey | |
| 36 | Run `/handoff` (the skill) | Clawd writes with the quill, not the thinking spinner | |
| 37 | Look at the wand | 18 px, grey like the labels; the clickable square matches it; clicking enhances | |
| 38 | Raise a permission prompt | The hand shows after 5 s (`askSeconds` option); tune it if it still shows too often | |

## 0.8.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 39 | Watch several turns: prompt, an Edit, a Read, a finish | Every change flows: a short start, a blink over the prop swap, a small hop, then a settle. Nothing slideshow-like | |
| 40 | Approve a permission (Edit, then a plain tool), fail a tool, pass a test run | hand > building / thinking, building > oops, oops > thinking, typing > lab, lab > typing: props swap one at a time | |
| 41 | Let a turn run long, search the web, compact, write a handoff, enhance a draft | typing / thinking > coffee, browse, dizzy; idle > writing > love > idle; idle > wand > idle | |

## 0.9.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 42 | Watch idle > thinking and bell > idle | Slow enough to see: his hand takes the sunglasses (or the bell) and puts it behind him; fetches the glasses from behind him and puts them on | |
| 43 | Read a file | The open book turns a page now and then; the body does not bob | |
| 44 | Trigger a bubble (a context warning with the band closed) | Grey bubble at the foot of the band, over the small print only; the meters' labels and bars stay visible; a soft dim around it; it slides in, and fades out | |
| 45 | Look at every button (bubble, alerts, Hide, OK, wand excepted) | All the same grey as the bubble, dark text; none white, none transparent | |
| 46 | A bubble with a button (cold cache, context warning) | It stays until you click the button or send another message, even if the warning goes away | |
| 47 | A bubble without a button ("Done.", "Tests passed") | It stays about 9 s after the state ends, then fades | |
| 48 | Approve a permission | The hand and "Needs your OK" go at once; the move out of the hand is quick | |
| 49 | Reach 80% of the 5-hour limit (or `/cockpit demo sleepy`) | He yawns: hand to mouth, mouth wide, eyes squeezed | |
| 50 | `/cockpit demo asleep` | Asleep with Zs drifting up; the alarm clock sits under him; the cockpit does not shift right | |
| 51 | Look at the wand and click it | Stick, a gap, then a sparkle and a small one apart; clickable; enhances the draft | |
| 52 | Run tests: `npm test`, `bun test`, `dotnet test`, `make test`, `pytest` | The flasks (lab) when they pass | |

## 0.10.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 53 | `What is 2+2?` from idle | You see the sunglasses (small) in his hand: lifted off his face, raised above the hand, then swung out behind him. At the bell the bell goes the same way and the sunglasses come back from behind him | |
| 54 | Read a file, then edit one | Glasses, hard hat, laptop, book: each carried by hand, not just vanishing | |
| 55 | Any bubble (a failed tool, "Done.") | Soft dim behind it with no hard line at the left or the bottom; it grows into place with a little overshoot and shrinks away | |
| 56 | Bubble with a button (context warning or cold cache, band collapsed) | The button is inside the bubble, dark with light text, labelled `Handoff` (no H, no arrow); clicking it works | |
| 57 | Let a turn finish while that bubble is open | "Done." does not replace it; he stays in the warning pose (does not go back to idle) until you click or send something else | |
| 58 | Look at the alert rows, Hide, OK and preflight buttons | Grey pills, plain labels, no hotkey badge, clickable | |
| 59 | `/cockpit demo sleepy` | Awake: eyes open, yawn with eyes squeezed, small Zs | |
| 60 | Reach the 5-hour limit, or `/cockpit demo asleep` | From the previous state: the alarm clock rises under him and pushes him up, he hops, his legs fold away, he slumps onto it, mask and Zs. No legs while asleep | |
| 61 | Raise a permission prompt | A red "!" above him with the clipboard | |
| 62 | `/cockpit demo detective` | He has a mouth | |
| 63 | Click the wand slightly off its centre | Still clicks (the area is 3 columns now) | |

