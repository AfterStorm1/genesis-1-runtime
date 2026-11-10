@echo off
rem Genesis-1 one-click voice engine installer (whisper.cpp + model + ffmpeg)
cd /d %~dp0
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-voice.ps1"
echo.
echo Install finished. Run voice.cmd probe to verify.
pause
