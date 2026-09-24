@echo off
setlocal
cd /d "%~dp0"

set "PORT=8765"
set "GAME_URL=http://127.0.0.1:%PORT%/"

rem Reuse the game server if it is already running.
powershell.exe -NoProfile -Command "try { $page = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%GAME_URL%'; if ($page.Content -match 'Neon Coast') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto open_game

where py >nul 2>&1
if not errorlevel 1 goto start_with_py
where python >nul 2>&1
if not errorlevel 1 goto start_with_python

echo Python 3 is required to serve the game's separate image assets.
echo Install Python, then run START_GAME.bat again.
pause
exit /b 1

:start_with_py
start "Neon Coast local server - Ctrl+C to stop" cmd /k "cd /d ""%~dp0"" && py -3 -m http.server %PORT% --bind 127.0.0.1"
goto wait_for_server

:start_with_python
start "Neon Coast local server - Ctrl+C to stop" cmd /k "cd /d ""%~dp0"" && python -m http.server %PORT% --bind 127.0.0.1"

:wait_for_server
timeout /t 2 /nobreak >nul
powershell.exe -NoProfile -Command "try { $page = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%GAME_URL%'; if ($page.Content -match 'Neon Coast') { exit 0 } } catch {}; exit 1" >nul 2>&1
if errorlevel 1 (
  echo The local server did not start at %GAME_URL%.
  echo Check whether another app is already using port %PORT%.
  pause
  exit /b 1
)

:open_game
start "" "%GAME_URL%"
exit /b 0
