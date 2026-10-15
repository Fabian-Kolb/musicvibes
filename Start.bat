@echo off
cd /d "%~dp0"
set EXE=node_modules\electron\dist\electron.exe
if not exist %EXE% (
  echo Pakete werden installiert, das dauert beim ersten Mal ein paar Minuten ...
  call npm install
)
if not exist %EXE% (
  echo Electron wird heruntergeladen ...
  rmdir /s /q node_modules\electron\dist 2>nul
  call node node_modules\electron\install.js
)
if not exist %EXE% (
  echo.
  echo FEHLER: Electron konnte nicht geladen werden. Bitte den Text oben kopieren und an Claude schicken.
  pause
  exit /b 1
)
call npm run app
pause
