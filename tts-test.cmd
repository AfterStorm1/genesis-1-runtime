@echo off
rem TTS smoke test (ASCII-safe): loads llm-config.cmd first so TTS_ENGINE/cloud voice apply.
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
node node_modules\tsx\dist\cli.mjs scripts\tts-test.ts
