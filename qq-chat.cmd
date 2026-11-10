@echo off
rem Genesis-1 QQ group bot launcher (OneBot 11 via NapCatQQ)
rem Usage: qq-chat.cmd   (loads llm-config.cmd; configure NapCat WS/HTTP ports below if needed)
cd /d %~dp0
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
if "%QQ_ONE_BOT_WS%"=="" set "QQ_ONE_BOT_WS=ws://127.0.0.1:3001"
if "%QQ_ONE_BOT_HTTP%"=="" set "QQ_ONE_BOT_HTTP=http://127.0.0.1:3000"
if "%QQ_TRIGGER%"=="" set "QQ_TRIGGER=?"
node node_modules\tsx\dist\cli.mjs hosts\qq-host\qq-bot.ts
if errorlevel 1 pause
