@echo off
setlocal
title 1a2n-track-id overlay server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed or not on PATH.
    echo Install it from https://nodejs.org and run this again.
    pause
    exit /b 1
)

if not exist node_modules (
    echo First run: installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

echo Building and starting the overlay server...
start "" http://127.0.0.1:8080/overlay
call npm run start
pause
