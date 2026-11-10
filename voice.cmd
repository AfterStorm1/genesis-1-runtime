@echo off
rem Genesis-1 voice transcribe CLI (whisper.cpp)
rem Usage: voice.cmd probe | file <audio> | listen [capture-device-id]
cd /d %~dp0
chcp 65001 >nul
node node_modules\tsx\dist\cli.mjs scripts\voice.ts %*
if errorlevel 1 pause
