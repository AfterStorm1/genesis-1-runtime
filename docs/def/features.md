# 功能清单矩阵（唯一权威）

> 本文件是「功能清单」的**唯一事实来源**：新增功能只更新本矩阵对应行；README / HANDOVER / HANDOVER-SESSION / handover-notes / architecture 等只引用、不复制功能条目。
> 基线：2026-11-14 人格/规则/记忆重置后。行为细节（为什么是值级、与附件 A 手册的偏差）见 `deviations.md` 对应 D-xx；配置参数见 `manual-config-guide.md`；扩展方法见 `architecture.md`。

## 状态图例

| 符号 | 含义 |
|---|---|
| ✅ | 已落地可用 |
| 🟡 | 逻辑在、数据/名单待填（重置后为空，需补配置才生效） |
| ⚠️ | 契约预留、未接线 |
| 🚧 | 空壳占位 |
| ⏳ | 规划中 / 未实现 |

## 功能矩阵

| 域 | 功能 | 档位 | 状态 | 主要实现位置 | 入口 / 开关 | 关联偏差 |
|---|---|---|---|---|---|---|
| 对话/认知 | 真实 LLM 对话（本地 Ollama / 在线 DeepSeek 双模式） | 值 | ✅ | `adapters/llm/openai-compatible-cognition.ts` | `chat.cmd`；`LLM_API_KEY` 切在线 | D-20 |
| 对话/认知 | 短期轮次记忆（逐字 JSONL，取最近 N 轮） | 值 | ✅ | `adapters/llm/memory/in-memory-history-store.ts` | `CHAT_MAX_TURNS` | D-20 |
| 对话/认知 | 长期记忆（LLM 提炼 / 容量淘汰 / TTL / 显式遗忘归档） | 值 | ✅ | `adapters/llm/memory/long-term-memory.ts` | `/记忆` `/忘记`；`CHAT_SUMMARY_EVERY` | D-21 |
| 对话/认知 | 第一人称感受记忆（强度逐日衰减） | 值 | ✅ | `adapters/llm/memory/feeling-memory.ts` | 摘要器联动 | D-26 |
| 对话/认知 | 情绪状态机（波动超阈值自主开口） | 值 | ✅ | `adapters/drive/emotion-state-machine.ts` | `CHAT_EMOTION`；`/情绪` | D-25 |
| 对话/认知 | 流式打字机输出（逐句切分 + 逐字打印） | 值 | ✅ | `adapters/llm/speech-segmenter.ts` + `adapters/renderers/streaming-text-renderer.ts` | `CHAT_STREAM` | D-23 |
| 对话/认知 | 语言过滤表后处理（不进 prompt） | 值 | ✅ | `adapters/llm/speech-postprocess.ts` | 内置 | D-22 |
| 对话/认知 | 最高优先级终止规则（越界永久只回「连接中断…」） | 值 | ✅ | `adapters/safety-guard/termination-hook.ts` | 内置 | D-22 |
| 对话/认知 | 反应样本库（few-shot 语气校准 + 自检题集） | 值 | 🟡 | `config/reactions/samples.json` + `adapters/llm/reaction-samples.ts` | 填 `samples.json`（已重置为空） | D-28 |
| 语音输出 | TTS 语音朗读（SAPI 离线） | 值 | ✅ | `adapters/tts/sapi-speaker.ts` + `adapters/renderers/tts-speech-renderer.ts` | `CHAT_TTS` | D-24 |
| 语音输出 | 云端克隆音色 + 语音管线加固（合成/逐句体检/拼接/慢放/垫静音/熔断） | 值 | ✅ | `adapters/tts/cloud-tts.ts` + `scripts/audio-*.py` | `TTS_ENGINE` `TTS_CLOUD_VOICE` `QQ_TTS_*` | D-34 |
| 语音输入 | SAPI 语音识别（`/说` 兜底） | 值 | ✅ | `adapters/stt/sapi-speech-recognizer.ts` | `/说`；`CHAT_STT_LANG` | D-27 |
| 语音输入 | 统一语音转写底座（file/device/network 三类 Source + whisper.cpp 双模式） | 值 | ✅ | `adapters/stt/voice-source.ts` + `transcriber-core.ts` + `whisper-engine.ts` | `voice.cmd`（probe/file/listen） | D-35 |
| 语音输入 | 语音转写三后端 + 一键安装（cloud / bin / py） | 值 | ✅ | `adapters/stt/cloud-transcriber.ts` + `setup-voice.cmd` | `STT_CLOUD_*`；优先级 cloud>bin>py | D-36 |
| 宿主 | 终端聊天宿主 | 值 | ✅ | `demo-chat.ts` + `hosts/chat-host/` | `chat.cmd` | D-20 D-29 |
| 宿主 | QQ 群机器人宿主（OneBot/NapCat；每群记忆隔离 / 触发 / 冷却防刷） | 值 | ✅ | `hosts/qq-host/qq-bot.ts` | `qq-chat.cmd`；`QQ_ONE_BOT_*` | D-31 |
| 宿主 | QQ 群能力扩展（语音转写 / 图片识别 / 引用触发 / boss 指令 / 好友问候 / 观察黑名单 / 颜文字） | 值 | ✅ | `hosts/qq-host/*` + `adapters/llm` | `QQ_OWNER_IDS` `QQ_FRIEND_IDS` `QQ_TRIGGER` | D-32 |
| 宿主 | B 站弹幕机器人 v1（HTTP 轮询） | 值 | ✅ | `hosts/bili-host/` | `BILI_TRIGGER` | D-37 |
| 契约预留 | 工具调用（ToolRegistry → tool_call 自动接线） | 形状 | ⚠️ | `core/tool/` + `RuntimeConfig.tools` | 未接线 | — |
| 契约预留 | Live2D / VRChat 渲染 | 形状 | 🚧 | `adapters/renderers/empty-vrchat-renderer.ts` + `adapters/actuator/` | 空壳 | — |
| 骨架插槽 | 加 Renderer（渲染器插槽，contractRanges 声明 + 两次校验落表） | 值/形状 | ✅ | `core/contract/renderer.ts` + `adapters/renderers/` | compose 装配 | — |
| 骨架插槽 | sharedBus 多 Runtime / 多角色 | 值 | ✅ | `core/bus/` | `createEventBus` | — |
| 骨架插槽 | 换人格 | 值 | ✅ | `config/persona/*.json` | `GENESIS_PERSONA` | D-22 |
| 验收/工具链 | 验收矩阵 A01a–A17 | — | ✅ | `tests/` + `scripts/scan-*` | `verify.cmd` | — |
| 验收/工具链 | 每周自检（9 步 + 报告归档） | 值 | ✅ | `scripts/weekly-check.ts` | `weekly-check.cmd` | D-28 |

> 说明：「关联偏差」列仅值级扩展有 D-xx（行为细节见 `deviations.md`）；标「—」表示手册范围内（契约预留 / 骨架插槽 / 验收工具链），无需偏差记录。
