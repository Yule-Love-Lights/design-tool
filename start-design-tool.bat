@echo off
REM ============================================================
REM  Yule Love Lights - Design Tool : dev server launcher
REM  Double-click to start the client (5173) + API (3000).
REM  Keep this window OPEN while using the tool; close it to stop.
REM ============================================================
title Yule Love Lights - Design Tool (dev servers)

REM Node isn't on PATH by default - add it just for this window
set "PATH=%ProgramFiles%\nodejs;%PATH%"

REM Dev-only shared login password + session secret
set "APP_PASSWORD=lights"
set "SESSION_SECRET=dev-session-secret-at-least-32-characters-long-ok"

REM Run from the repo folder this file lives in (portable)
cd /d "%~dp0"

REM Auto-open the browser ~7s after launch (gives the servers time to boot)
start "open design tool" /min cmd /c "timeout /t 7 >nul & start http://localhost:5173"

echo.
echo   Yule Love Lights - Design Tool
echo   Client: http://localhost:5173
echo   API:    http://localhost:3000
echo   Login password: lights
echo.
echo   Starting dev servers... (keep this window open; close it to stop)
echo.

call npm run dev

echo.
echo   Dev servers stopped. Press any key to close this window.
pause >nul
