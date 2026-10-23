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
| 56 | Bubble with a button (context warning or cold cache, band collapsed) | The button sits right at the bubble's right edge (since 0.12.0), dark with light text, labelled `Handoff`; clicking it works | |
| 57 | Let a turn finish while that bubble is open | "Done." does not replace it; he stays in the warning pose (does not go back to idle) until you click or send something else | |
| 58 | Look at the alert rows, Hide, OK and preflight buttons | Grey pills, plain labels, no hotkey badge, clickable | |
| 59 | `/cockpit demo sleepy` | Awake: eyes open, yawn with eyes squeezed, small Zs | |
| 60 | Reach the 5-hour limit, or `/cockpit demo asleep` | From the previous state: the alarm clock rises under him and pushes him up, he hops, his legs fold away, he slumps onto it, mask and Zs. No legs while asleep | |
| 61 | Raise a permission prompt | A red "!" above him with the clipboard | |
| 62 | `/cockpit demo detective` | He has a mouth | |
| 63 | Click the wand slightly off its centre | Still clicks (the area is 3 columns now) | |

## 0.11.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 64 | Raise a permission prompt | The red "!" is centered above his head, two pixels wide | |
| 65 | Any bubble | The shadow follows the bubble's own stepped shape, a few pixels wide, and is not cut off at the bottom or sides | |
| 66 | Cold cache bubble: hover and click `Handoff` | Superseded by 70 | |
| 67 | Cold cache, then send any message | The frozen pose and its bubble go as soon as the message is sent | |
| 68 | Reach the 5-hour limit (asleep), then wait for its reset time | He wakes by himself at the reset time, without a reply, and the bubble goes | |
| 69 | A context warning bubble: send a message; the warning still holds | The bubble does not come back until the warning ends and returns | |

## 0.12.0 additions

| # | Do | Expect | OK? |
|---|---|---|---|
| 70 | Cold cache bubble: hover `Handoff`, click it near each edge | One highlight, exactly over the dark `Handoff` chip next to the bubble (no second area above or below); every part of the chip clicks | |
| 71 | Look at the alert rows, Hide, OK, Switch and preflight buttons | Grey chips, dark text; the highlight is the chip itself; every part clicks | |
| 72 | Click the wand near its edges | Still clicks (area 3 columns, from its top left) | |
| 73 | From idle, raise a permission prompt (or `/cockpit demo hand`) | No bell shape in the move: the small thing carried is a clipboard with a clip on top | |
| 74 | `/cockpit demo` from any state to `cold`, one after another (`demo typing`, then `demo cold`) | He turns from orange to ice blue over about 2 s, not at once; leaving cold warms him over about 1 s | |
| 75 | `/cockpit demo cold` | Clawd frozen and the bubble with `Handoff` stay (not 4 s); sending a message ends both together; `/cockpit demo off` too | |
| 76 | `/cockpit demo` (every state, 4 s each) | Each state and its bubble leave together; nothing stays after the tour | |
| 77 | `/cockpit demo detective`, then idle | The hat is carried in a brown fedora, not a yellow hard hat | |



## 0.15.0: one row, one bubble (older rows above that mention the arrow, /cockpit open|close|auto, the saver line or `/cockpit bubble` no longer apply)

| # | Do | Expect | OK? |
|---|---|---|---|
| 80 | Look at the band for a minute while Claude works and changes pose | The meters never flicker or reload; only Clawd changes | |
| 81 | `/meters warn 5` and wait for the tipsy pose | A bubble row under the meters (never over a number) with a gray **Handoff** button of the same gray as the bubble, and a **…** | |
| 82 | Click **…** | A row with Compact, Copy brief, Fresh, same gray. Each one works; the row closes | |
| 83 | `/cockpit demo cold`, then `/cockpit demo fire` | The old words are deleted letter by letter, the bubble resizes, the new words are typed. No pop | |
| 84 | Narrow the window and trigger a long message (cold cache) | Two lines, or an ellipsis; never text running past the bubble | |
| 85 | Click the very edge of a gray button, and the space beside it | The edge clicks; the space beside does nothing | |
| 86 | In a git repo with uncommitted files | One bubble with the first finding and its button; **…** lists the others and Hide all | |
| 87 | `/preflight` actions: New worktree | A bubble "Worktree ready" with **Switch**; **…** has Copy path and OK | |
| 88 | Let Saver route an easy prompt to Haiku | A bubble "Haiku answered that · saved $x today"; no saver line anywhere | |


## 0.16.0: the bubble lane

| # | Do | Expect | OK? |
|---|---|---|---|
| 89 | Watch the cockpit while bubbles come and go | It never changes height: the bubble lane is always there under the meters | |
| 90 | Look at a bubble | No shadow, black border, as wide as its words, tail pointing to Clawd, buttons at the right in the same height | |
| 91 | Let one bubble give way to another (`/cockpit demo cold`, then `/cockpit demo fire`) | Old words deleted letter by letter, bubble resizes, new words typed; no flash. Opening scales out of Clawd; closing scales back | |
| 92 | Have a warning bubble dismissed (send a message), then move the pointer over Clawd | The bubble reappears while the pointer is on him, and goes when it leaves | |
| 93 | Let Claude edit a file, then finish | The bubble says "Editing x" only while he is the builder; when he changes pose the words are deleted | |
| 94 | Permission prompt vs. a question (AskUserQuestion) | The raised hand with the bobbing "!" only for the question | |

| 95 | Ask Claude to write a long new file | Clawd paints (moustache, a palette in one hand, a brush in the other) with the bubble "Creating <file>"; the hammer when the tool runs | |
| 96 | Let Claude ask you a question (AskUserQuestion) | The cockpit stays under the question; Clawd raises his hand with the bobbing "!" | |

## 0.19.0

| # | Do | Expect | OK? |
|---|---|---|---|
| 97 | Click Clawd (his body) while a warning bubble is dismissed or he is thinking | The warning comes back with its button, or a short line says what he is doing | |
| 98 | Click each gray button at its top, bottom, left and right edges | Every edge of the drawing clicks; nothing outside it does; no second button shows | |
| 99 | Let a bubble change text (`/cockpit demo cold` then `demo fire`) | The old words are deleted and the bubble shortens; the new ones are typed and it lengthens. No second bubble over the first | |
| 100 | Watch Clawd typing for 10 seconds | He chews, blows a pink bubble, it pops, he chews again | |
| 101 | Switch to another session and back | Clawd's box is not white. If it is: does it clear by itself, or on the next pose change? | |
| 102 | Ask Claude to run a slow command (`sleep 5`) and a test run, or `/cockpit demo running` | Same Clawd as typing (eyes, laptop, gum), with green lines of code scrolling up behind him; the lines fade in over about a second and fade out when the command ends; a quick `ls` never shows them | |
| 103 | Look at the wand and the return arrow, then press Enhance with a draft | Two equal small squares with a thin gray outline and a small centered drawing, the same gray as the meters' labels; the wand turns green while it works and nothing else changes; gray again when done; clicking anywhere in a square works | |
| 104 | Run a slow command (`sleep 6`) and, while the green lines scroll, make Claude Edit or Read a file; also let it go from typing to a command and back | Clawd does not flash or jump when the pose changes: the lines keep scrolling from where they were while they leave from the bottom up, and the gum and arms carry on | |
| 105 | Ask Claude to start a command in the background (`npm run dev` or any long one, run in the background) and let the turn end | After the bell he puts on a bucket hat and fishes: worm on the hook, cast, a long wait on a thin ripple (a yawn, a nibble), reel in, a look at the empty hook, a shrug, again. When the task reports he goes back to idle; a cache or context alert still takes his turn | |
| 106 | Change pose often (a command, an Edit, a Read) and watch Clawd | A pose change may still blank him for a frame, but less than before; compare entering running from idle with the earlier recording (3 blank frames) | |
| 107 | Click the dots under Clawd to show his bubble, then click again (or wait 8 s) | It opens by growing out of Clawd while the words are typed, and closes the same way backwards: the words go and the bubble shrinks into him, together | |
| 108 | Click Clawd in different poses (typing, running, thinking, fishing, idle, a walk) and click again | Every pose says something light and cheeky; the second click says a different line | |
| 109 | Ask a question that opens the AskUserQuestion dialog (Claude asks you to choose) | The band above the dialog is the normal small size (Clawd about 60 px tall), not enlarged over the question | |
| 110 | Run a WebSearch or WebFetch | Clawd holds the magnifying glass in his left hand and sweeps it over the browser window on the right | |
| 111 | Use a connector tool (any `mcp__` tool, e.g. a GitHub or Gmail call) | Clawd, smiling, holds up both halves of the cable, they plug together with a spark, and green waves go out each side; it ends with the tool | |
| 112 | Run a session past 50% of the context window with the model you use most | The context bar turns orange and the warning bubble appears at 50%, not before, whatever the model | |
| 113 | Click the dots (or Clawd) to open the bubble, then click again; also let a light bubble expire. Record the screen: the exit must not be a single frame | The bubble stays whole a moment (about 0.5 s, no blink, no leftover piece sticking out while it shrinks), then the words are deleted letter by letter while the bubble gets shorter, then it shrinks into Clawd and fades; it does not vanish at once | |
| 114 | Change pose several times (read a file, edit one, run a search, leave typing) and record the screen | Clawd is never missing for a frame: the new pose appears with no gap and no second copy of him shows while he moves | |
| 115 | Look at the bottom of the band while the bubble speaks (and with its buttons) | About half the space under the bubble it had (about 8 px); the bubble and its buttons are not cut at the bottom; opening the "…" menu does not overlap them | |
| 116 | Reach the 5-hour limit (or `/cockpit demo asleep`), wait a minute | Clawd stays asleep and does not take turns with other poses until the limit resets | |
| 117 | Let the cache go cold (or `/cockpit demo cold`), then send a message | The cold comes on gradually (flakes, ice, blue), the snow falls slowly, the shiver is small and short; sending a message warms him up gradually | |
| 118 | Let the cache go cold (or `/cockpit demo cold`) and look at the bubble's buttons | The buttons are level with the bubble (same top and bottom, same centre); they pop in just after the bubble and pop out before it closes, with no blink | |
| 119 | Press the button on the cold or going-cold bubble | The brief appears in the prompt box (and is copied); the session is not cleared | |
