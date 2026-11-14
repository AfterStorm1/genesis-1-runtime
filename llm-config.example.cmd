@echo off
rem Genesis-1 LLM config (local file, NOT committed to git)
rem Copy this file to llm-config.cmd in the same folder, fill in your key, then chat.cmd goes online.
rem ---- online DeepSeek ----
set "LLM_API_KEY=sk-paste-your-key-here"
set "LLM_BASE_URL=https://api.deepseek.com"
set "LLM_MODEL=deepseek-chat"
rem ---- optional: fix persona ----
rem set "GENESIS_PERSONA=config\persona\skeleton.persona.json"
rem ---- optional: world rules / reaction samples ----
rem set "CHAT_WORLD_RULES=config\world\rules.skeleton.md"
rem set "CHAT_REACTION_SAMPLES=config\reactions\samples.json"
rem ---- optional: local ollama overrides (used when LLM_API_KEY is empty) ----
rem set "OLLAMA_MODEL=qwen3:8b"
rem ---- optional: cloud STT (voice transcription via SiliconFlow, OpenAI-compatible) ----
rem set "STT_CLOUD_KEY=sk-paste-siliconflow-key"
rem set "STT_CLOUD_BASE_URL=https://api.siliconflow.cn/v1"
rem set "STT_CLOUD_MODEL=FunAudioLLM/SenseVoiceSmall"
rem ---- optional: QQ group bot boss (comma-separated QQ numbers; can use !reset/!clear/!status) ----
rem set "QQ_OWNER_IDS=your-qq-number"
rem ---- optional: QQ group bot close friends (recognized, no boss commands) ----
rem set "QQ_FRIEND_IDS=friend-qq-number"
rem ---- optional: QQ group bot trigger word (unset = placeholder "bot") ----
rem set "QQ_TRIGGER=trigger-word"
rem ---- optional: cloud TTS voice (clone uri or built-in model:voice) ----
rem set "TTS_CLOUD_VOICE=FunAudioLLM/CosyVoice2-0.5B:claire"
rem ---- optional: bilibili live danmaku bot ----
rem set "BILI_ROOM_ID=????"
rem set "BILI_COOKIE=???????Cookie(?bili_jct????????????)"