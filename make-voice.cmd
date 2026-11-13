@echo off
rem One-click cloud voice creation (ASCII-safe):
rem 1) Edge synthesizes a reference clip (Xiaoxiao, pitch -5Hz, rate -12%) from data\tmp\voice-ref.txt
rem 2) uploads it to SiliconFlow for voice cloning; uri saved to data\tmp\voice-uri.txt
rem Requirement: SiliconFlow account must pass real-name verification before cloning works.
chcp 65001 >nul
if exist "%~dp0llm-config.cmd" call "%~dp0llm-config.cmd"
if not exist "data\tmp\voice-ref.txt" (
  echo [make-voice] missing data\tmp\voice-ref.txt
  exit /b 1
)
echo [make-voice] 1/2 generating reference clip with Edge...
tools\whisper-py\Scripts\edge-tts.exe --file "data\tmp\voice-ref.txt" --voice zh-CN-XiaoxiaoNeural --pitch -5Hz --rate -12% --write-media "data\tmp\voice-base.mp3"
if errorlevel 1 (
  echo [make-voice] reference clip failed
  exit /b 1
)
echo [make-voice] 2/2 uploading for voice cloning...
node node_modules\tsx\dist\cli.mjs scripts\clone-voice.ts "data\tmp\voice-base.mp3" hui-kuudere
