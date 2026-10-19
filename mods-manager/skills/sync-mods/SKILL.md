---
name: sync-mods
description: Install and load every mod the user builds, in every session, and get merged changes into the Claude desktop app. Use right after creating or editing a mod (a folder with .claude-plugin/plugin.json and hooks/), when the user says "install my mods", "sync mods", "update mods", "versions are stale", "I merged the PR", or "add this mod to claude-mods", and at the end of any mod-building task.
---

# sync-mods

## UPDATE THE MODS AFTER A MERGE (Claude desktop app, Windows)

The app keeps its own saved copy of the GitHub repo and never refreshes it by itself, so a merged pull request does not reach the plugins until that copy is pulled. Deleting and reinstalling the plugins re-reads the same stale copy. Do this every time a pull request is merged:

1. **Pull the saved copy.** In PowerShell (not in Claude):
   ```powershell
   & "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods\tools\update-mods.cmd"
   ```
   or, without that file:
   ```powershell
   git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull
   ```
   Optional one-word shortcut (add to the PowerShell profile with `notepad $PROFILE`; it only loads if script execution is allowed):
   ```powershell
   function Update-Mods { git -C "$env:USERPROFILE\.claude\plugins\marketplaces\claude-mods" pull; "Now click Update in Plugins and start a new session." }
   ```
2. Check the printed versions against the ones in the pull request.
3. In the app: **Plugins** page, click **Update** on each plugin that offers it (or remove and reinstall: the copy is current now).
4. Start a **new** local session. A running session keeps the old code.

If the versions are still old, `git -C <that folder> log --oneline -1` should say "Merge pull request #<the one just merged>". If the folder is missing, list `$env:USERPROFILE\.claude\plugins\marketplaces` and use the folder named after the marketplace.

When you finish building or changing a mod in a session, end by telling the user to do these four steps once the pull request is merged, and remind them that every change must bump the plugin's version (otherwise **Update** will not appear).

The `claude-mods` marketplace lives in `~/mods` (a git clone of `ferranserv/claude-mods`). Every mod there is installed at user scope, so it loads in every session.

## After you build or change a mod

1. Finish the mod first: `claude plugin validate <mod folder>` and `claude plugin test <mod folder>` must pass.
2. Run the sync script that sits next to this file:

   ```
   bash <this skill's base directory>/sync.sh
   ```

   It does, in order, and is safe to repeat:
   - copies mods from `~/.claude/dev-mods/*/<mod>` into `~/mods/<mod>` when they are new or changed,
   - rewrites `~/mods/.claude-plugin/marketplace.json` from the mod folders present,
   - adds or updates the `claude-mods` marketplace,
   - installs each mod as `<mod>@claude-mods` at user scope if it is not installed yet.
3. Run `bash <base directory>/sync.sh --commit` when the user wants the change committed in `~/mods`. Pushing stays the user's call: `git -C ~/mods push`.
4. Show the result with `claude plugin list` and tell the user `/reload-plugins` loads new mods in the current session; new sessions load them on their own.

## Flags

| Flag | Effect |
| --- | --- |
| `--quiet` | no output; exits at once when nothing changed since the last sync (cheap enough for a SessionStart hook) |
| `--commit` | commits `~/mods` after syncing; never pushes |
| `--install-hook` | one-time: adds a SessionStart hook to `~/.claude/settings.json` that runs `sync.sh --quiet`, so mods dropped into `~/mods` or `dev-mods` install themselves at the start of every session |

`MY_MODS_DIR` overrides `~/mods`.

## Rules

- Never delete a mod folder in `~/mods` unless the user asks.
- Do not edit `~/.claude/settings.json` by hand for this; `--install-hook` merges without touching other keys.
- A mod that fails validation is not synced: fix it, then run the script again.
