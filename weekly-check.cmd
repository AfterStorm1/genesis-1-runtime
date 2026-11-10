@echo off
rem Genesis-1 weekly self-check launcher
rem Usage: weekly-check.cmd   (loads llm-config.cmd if present, runs all steps, writes report)
cd /d %~dp0
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
node node_modules\tsx\dist\cli.mjs scripts\weekly-check.ts
if errorlevel 1 pause
