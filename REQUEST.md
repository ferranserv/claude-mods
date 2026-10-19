# REQUEST

Owner: Ferran (Efform, Operational Transformation). Repo: ferranserv/claude-mods.

Goals
1. Back up installed mods to this repo (BLOCKED: mods live on user's machine, not in the cloud container).
2. Modify existing mods: saver/context lines layout, context-bar colors+50% warning+smaller messages, check meters side/top, cache countdown + 5-min notification + cost, Handoff & Clear, hotkeys, `/handoff`.
3. New mods: Plan Progress, Prompt Enhancer (DONE).
4. Audit last 20 sessions; propose 5 mods; build none until picked.
5. ~/mods as `my-mods` marketplace, all mods installed, skill to keep new mods installed, preloaded every session.

Success: mods validate + tests pass; sync skill installs them; user picks audit idea.
Constraint: token-lean (no model calls where avoidable).
