@echo off
setlocal
cd /d "%~dp0"
title MyVirtualCommunity Launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-windows.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Launch exited with error code %ERRORLEVEL%.
    pause
)
