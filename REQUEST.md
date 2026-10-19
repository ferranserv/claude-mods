# REQUEST

Owner: Ferran (Efform, Operational Transformation). Repo: ferranserv/claude-mods.

Goals (status 2026-10-19, session 2)
1. Back up installed mods to this repo: DONE for saver + meters (pushed by owner). context-bar / usage-limits are replaced by meters.
2. Modify existing mods:
   - [x] divider + space between saver and bars, saver below the bars
   - [x] context bar: color by warning, first warning 50%, red past 80%, smaller messages that wrap instead of cutting off
   - [ ] cut-off against the owner's screenshot: not seen, width/wrap done by estimate (see PROGRESS.md)
   - [x] meters side/top checked by tests
   - [x] cache countdown, window learned or 60 min and changeable, next-message cost warm vs cold, notice 5 min before cold
   - [x] Handoff & Clear button, `/handoff`, quality-degradation warning, hotkeys (new session with handoff, fresh session)
3. New mods: Plan Progress, Prompt Enhancer (done).
4. Audit last 20 sessions: owner runs `tools/audit-sessions.py`, picks one of five ideas. Nothing built until picked.
5. ~/mods as `claude-mods` marketplace, skill to keep new mods installed (done, tested in a cloud container only).

Success: mods validate + tests pass; bands stack in any order; owner confirms on screen.
Constraint: token-lean (no model calls where avoidable).
