# 交接静态说明（gen-handover.ts 会把本文件并入 docs/HANDOVER.md）

## 项目一句话

Genesis-1 角色运行时骨架（契约候选 v1.0.0-rc.5）：骨架定「今天长什么样」，插槽定「明天能长什么」，
判定表定「哪些明天不该长进来」。已叠加真实 LLM 对话（本地 Ollama / 在线 DeepSeek 双模式）、
三级对话记忆（短期轮次 / 长期提炼 / 遗忘机制）、一键聊天入口。

## 权威与状态

- 契约权威：附件 A《Genesis-1 角色运行时骨架手册（整理版）v1.0.0-rc.5-r1》；冻结决策 G/S/P0/P1/R/E 不重设计。
- 验收：A01a–A17 本地（verify.cmd 9 步全绿）+ GitHub Actions CI 全绿（见 docs/evidence/ci-status.md）。
- 状态口径：内部受控测试候选；**不是 v1.0.0**；不承诺生产安全/跨进程总线/真实适配器行为。
- 改动纪律：core/ 不 import adapters/、layers/；新能力只加 adapters/ 或四插槽；动 core/contract/ 必升版本 + 幂等 migrator。

## 本机环境注意事项（换机器/新环境必读）

1. 依赖：本机 pnpm 网络栈直连 npm 仓库报 WSAEACCES(10013)（Hyper-V 端口保留区重叠），
   改用 `npm install --registry=https://registry.npmjs.org`；正常环境用 pnpm 脚本即可。
2. 系统改动（曾做）：TCP 动态端口池改到 57060–65499，还原命令
   `netsh int ipv4 set dynamicport tcp start=49152 num=16384`。
3. 本地 LLM：Ollama 已装 qwen2.5:7b（4.7GB）与 qwen3:8b（5.2GB，默认）；`ollama pull <model>` 增装。
4. 在线 LLM：`llm-config.cmd`（已被 git 忽略）保存 key，模板见 `llm-config.example.cmd`；
   环境变量优先级：LLM_API_KEY 存在即在线（LLM_BASE_URL/LLM_MODEL），否则本地（OLLAMA_*）。
5. 聊天数据：`data/chat-history/`（每角色一个 .jsonl + .longterm.jsonl），已被 git 忽略。
6. 一键入口：`chat.cmd`（聊天，默认人格「蕙」+ 默认规则 hui-rules.md）、`verify.cmd`（本地 10 步复验，含刷新 HANDOVER.md）。
7. 人工配置：人格/世界观/任务/对话偏向/模型/记忆参数全部入口见 `docs/def/manual-config-guide.md`；
   新增可配项：CHAT_WORLD_RULES（规则文件）、CHAT_EXTRA_SYSTEM（追加规则）、CHAT_TEMPERATURE。
8. 主角「蕙」已录入：人格卡 `config/persona/hui.persona.json`、规则 `config/world/hui-rules.md`；
   语言过滤表后处理 `adapters/llm/speech-postprocess.ts`（不进 prompt）；最高优先级终止规则
   `adapters/safety-guard/termination-hook.ts`（PipelineHook 输入侧强制，越界后永久只回“连接中断...”）。
9. 流式输出（渲染层）：`adapters/llm/speech-segmenter.ts` 切分 + `adapters/renderers/streaming-text-renderer.ts`
   打字机打印（默认开启；CHAT_STREAM=0 关闭，CHAT_CHAR_DELAY/CHAT_SENTENCE_DELAY 调节奏）。
   真·token 级提前输出为形状级演进（见 deviations D-23）。
10. TTS 语音输出：`adapters/tts/sapi-speaker.ts`（Windows SAPI 离线朗读）+ `adapters/renderers/tts-speech-renderer.ts`
    （默认开启；CHAT_TTS=0 关闭，CHAT_TTS_RATE 调语速 -10~10）。Speaker 抽象可替换 edge-tts/piper。
11. 情绪状态机（轻量 InternalDrive）：`adapters/drive/emotion-state-machine.ts` + `emotion-bias-hook.ts`
    （默认开启；CHAT_EMOTION=0 关闭；每 60s tick，情绪波动超阈值她会主动说话；聊天命令 /情绪 查看）。
12. 记忆第一人称感受层：`adapters/llm/feeling-memory.ts`（感受会淡：强度逐日衰减，容量 20/TTL 14 天），
    摘要器一次提炼 [事实]+[感受] 两节；/记忆 分「感受」「事实」两栏，/忘记 同时清两层。
13. STT 语音输入：`adapters/stt/sapi-speech-recognizer.ts`（Windows SAPI 语音识别，离线）；
    聊天里打 `/说` 对着麦克风说话；需系统装有中文语音识别语言包；CHAT_STT_LANG 可换区域。
14. 反应样本库 + 每周自检：`config/reactions/samples.json`（15 条：12 工作/通用 + 3 生活面，作为语气校准
    few-shot 注入 + 自检题集）；`weekly-check.cmd` 跑 9 步自检，报告固定在 `docs/evidence/weekly-check-latest.md`
    （已设每周一 09:00 自动执行）。反应评测为关键词级粗评。
15. 人格去工作场景依赖：规则文件顶部「场景框架」元指令 + 「生活面」节（住处=旧京老城区小公寓、
    旧书铺老板/隔壁老奶奶两个工作外关系，已填）+ 「非工作场景」规则节；工作规则降入「可选场景」节。
    验收：`scripts/check-descope.ts`（V1-V3，报告 docs/evidence/persona-descope/）；V4 回归 = weekly-check。
16. QQ 群机器人宿主（值级）：`hosts/qq-host/qq-bot.ts`（OneBot 11 正向 WS，适配 NapCatQQ；每群独立运行时
    记忆隔离、@或触发词应答、冷却防刷、群聊关 TTS/流式）；`qq-chat.cmd` 启动；ChatRuntimeOptions 增加
    historyDir/tts/stream/emotion 覆盖。⚠️ 非官方协议有封号风险，建议专用小号。
17. 统一语音转写底座（Phase 1，值级）：`adapters/stt/voice-source.ts`（音频源抽象：file/device/network 三类，
    新增场景=新增 Source）+ `transcriber-core.ts`（TranscriberCore 抽象：probe/transcribeFile/transcribeStream）
    + `whisper-engine.ts`（whisper.cpp 双模式实现：ffmpeg 转码 + whisper-cli 文件 / whisper-stream 流式，
    零 npm 依赖，引擎缺失优雅降级+下载指引）+ `scripts/voice.ts`/`voice.cmd`（probe/file/listen 三个入口）。
    待装：tools/whisper/{whisper-cli,whisper-stream,ggml-*.bin} + tools/ffmpeg/ffmpeg.exe。
    后续 Phase：VRChat NetSource（UDP Opus）、电话音频桥、宿主接线（QQ/飞书语音消息）。

## 下一步候选（按推荐顺序，均待拍板）

1. 高音质 TTS（edge-tts/piper 替换 SAPI Speaker，值级）；
2. Live2D / VRChat OSC（形状级，先三档判定评审）；
3. Web 聊天宿主（复用 demo-chat 导出的 createChatRuntime/sendUserMessage，值级）；
4. 多角色共存 demo（sharedBus 已预留，值级可先跑）；
5. 长期记忆向量化（把 long-term-memory 换成 embedding 检索，值级）；
6. 工具自动执行回路（CognitionOutput.tool_call → ToolRegistry.invoke 自动接线，形状级）；
7. 待确认类型清单（docs/def/pending-types.md，21 项）逐项拍板。

## 新会话交接检查清单（接手第一件事）

1. 读本文件（docs/HANDOVER.md）→ 读 docs/def/architecture.md（查询索引）；
2. `npm install`（本机）或 `pnpm install`（正常环境）；
3. `verify.cmd` 确认 9 步全绿；CI 状态看 docs/evidence/ci-status.md；
4. `chat.cmd` 跑通一条对话（本地或在线）；
5. 改动前查 docs/def/deviations.md 与 pending-types.md，避免踩已记录的坑；
6. 每次大改动后跑 `pnpm handover` 刷新本文件并提交。
