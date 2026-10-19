# PROGRESS

## Batch 1: new mods (done)
- plan-progress: 8 tests pass, validate ok, tsc ok. No model calls.
- prompt-enhancer: 6 tests pass, validate ok, tsc ok. 1 haiku call per Enhance.
- mods-manager + sync.sh: tested install into `my-mods` (3 plugins, user scope). Idempotent; never overwrites newer ~/mods copy.
- tools/audit-sessions.py: written, smoke-tested on 1 session only.

## Unblocked 2026-10-19: saver and meters are in this repo
Pushed by the local session: `saver/` (7 tests) and `meters/` (context bar + 5-hour + weekly slots, band or `/meters side`). `meters` replaces the user's earlier context-bar and usage-limits mods, so the context-bar color/50%-warning work applies to `meters`. See `HANDOFF.md` for exact state, API gotchas and what is unverified.

## Blocked: needs user's existing mods (now partly resolved, see above)
Waiting on: user pushes saver / context-lines / meters (side, top) mods to a branch of this repo, plus the screenshot pasted in chat.
Then: layout fixes, context-bar colors (first warning 50%), smaller warnings + wider cutoff, meters check, cache countdown (+5 min notify, cost in/out of window), Handoff & Clear, `/handoff`, quality-degradation warning, hotkeys.

## Open decisions
- Enhance button cannot sit inside the prompt box (no API site). Band above prompt instead.
- Dev-copy + installed copy of same mod can double-load in one session.

## Context refresher
Mods are 3 files: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`. Check: `claude plugin validate|test <dir>`.
