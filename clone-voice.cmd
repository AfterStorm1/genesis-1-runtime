@echo off
rem One-click voice clone (ASCII-safe): loads llm-config.cmd first so keys are present.
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
node node_modules\tsx\dist\cli.mjs scripts\clone-voice.ts "data\tmp\my-voice.wav" hui-voice
