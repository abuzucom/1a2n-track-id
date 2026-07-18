@echo off
setlocal
title 1a2n-track-id overlay server
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
    echo PowerShell is required and was not found on PATH.
    pause
    exit /b 1
)

REM start-overlay.ps1 binds the server's lifetime to this window, so
REM closing this window also stops the overlay server. See that script
REM for details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-overlay.ps1"
