@echo off
rem Pulls the mods marketplace copy the Claude desktop app keeps on this PC, then tells you what to click.
rem Run it after a pull request is merged. Double-click it, or run it from PowerShell or cmd.
setlocal
set "M=%USERPROFILE%\.claude\plugins\marketplaces\claude-mods"
if not exist "%M%\.git" (
  echo Marketplace copy not found: %M%
  echo Folders that exist here:
  dir /b "%USERPROFILE%\.claude\plugins\marketplaces"
  pause
  exit /b 1
)
echo Before:
git -C "%M%" log --oneline -1
git -C "%M%" pull --ff-only
echo After:
git -C "%M%" log --oneline -1
echo.
echo Versions now in the marketplace:
powershell -NoProfile -Command "(Get-Content '%M%\.claude-plugin\marketplace.json' -Raw | ConvertFrom-Json).plugins | ForEach-Object { '{0}  {1}' -f $_.name, $_.version }"
echo.
echo Next: open Claude, Plugins page, click Update on each plugin, then start a NEW local session.
pause
