@echo off
rem Genesis-1 persona descope acceptance (V1-V3; V4 via weekly-check.cmd)
rem Usage: check-descope.cmd   (loads llm-config.cmd if present)
cd /d %~dp0
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
node node_modules\tsx\dist\cli.mjs scripts\check-descope.ts
if errorlevel 1 pause
