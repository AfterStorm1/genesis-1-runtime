@echo off
rem Genesis-1 chat launcher
rem Usage:
rem   chat.cmd            -> skeleton persona (default; fill config\persona\skeleton.persona.json)
rem   chat.cmd example    -> example persona
rem   online mode: put LLM_API_KEY into llm-config.cmd (see llm-config.example.cmd)
cd /d %~dp0
chcp 65001 >nul
rem Load local config if present (not committed to git)
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
if not "%GENESIS_PERSONA%"=="" goto run
if "%1"=="" (
  set "GENESIS_PERSONA=config\persona\skeleton.persona.json"
) else (
  set "GENESIS_PERSONA=config\persona\%1.persona.json"
)
:run
echo Genesis-1 chat launcher: persona = %GENESIS_PERSONA%
node node_modules\tsx\dist\cli.mjs demo-chat.ts
if errorlevel 1 pause
