# Updating the mods after a merge (Claude desktop app, Windows)

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

The app keeps its copy of the `claude-mods` marketplace under `~/.claude/plugins/marketplaces/claude-mods` (a git clone of `ferranserv/claude-mods`). `cockpit` is installed at user scope, so it loads in every session.
