@echo off
REM ---------------------------------------------------------------------------
REM  SideScroller - start the game server
REM  Double-click this file (or run it from a terminal) to launch the server.
REM  Players then open http://localhost:3000 (or the LAN URL it prints) in a
REM  browser. Close this window or press Ctrl+C to stop the server.
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"
title SideScroller Server

REM --- check Node.js is installed -------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   Install it from https://nodejs.org/ ^(LTS is fine^), then run this again.
  echo.
  pause
  exit /b 1
)

REM --- install dependencies on first run ------------------------------------
if not exist "node_modules\" (
  echo.
  echo   First run - installing dependencies ^(this happens once^)...
  echo.
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo   npm install failed. See the messages above.
    echo.
    pause
    exit /b 1
  )
)

REM --- launch ----------------------------------------------------------------
echo.
echo   Starting SideScroller... open the URL below in your browser.
echo   Press Ctrl+C or close this window to stop the server.
echo.
node server\index.js

echo.
echo   Server stopped.
pause
