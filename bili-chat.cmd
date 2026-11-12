@echo off
rem Bilibili live danmaku bot (ASCII-safe launcher)
rem Usage: set BILI_ROOM_ID=your-room-id in llm-config.cmd, then run bili-chat.cmd
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
node node_modules\tsx\dist\cli.mjs hosts\bili-host\bili-bot.ts
