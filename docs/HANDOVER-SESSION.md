# 会话交接文件（Genesis-1 运行时 · 已重置为骨架）

> 给下一个会话/接手的 AI 或人。更新于 2026-11-14（人格/规则/记忆已彻底重置）。
> 新会话开场白：**「读 D:\Whale-chan\Hui\runtime\docs\HANDOVER-SESSION.md 后继续」**

## 零、本次重置做了什么（2026-11-14）

- 人格卡、世界规则、梗词典、反应样本、全部对话记忆、身份名单（老板/朋友）、克隆音色 —— **全部清空**
- 上一版的人设、身份、语音素材已打包在 `data/backup/reset-20261114-1344.zip`（`data/` 被 gitignore，不进仓库）
- 旧的设定文件仍在 git 历史里（`git log -- config/persona`），需要时可以翻回来
- 代码、契约、适配器、测试、启动器、API key、STT/TTS 引擎参数 —— **一个没动**
- 现在是一个"能跑但没人格"的骨架：默认人格卡 `config/persona/skeleton.persona.json`、默认规则 `config/world/rules.skeleton.md`，里面全是 `（待填写）`

## 一、项目与启动

- 项目根：`D:\Whale-chan\Hui\runtime`（git 仓库）
- 启动顺序：① NapCat（`D:\ruanjian\NapCat.Shell.Windows.Node\napcat.bat`，QQ 登录）→ ② `qq-chat.cmd`（机器人）
- 终端聊天：`chat.cmd`；本地自检：`verify.cmd`（或 `pnpm test` / `npx tsc --noEmit`）
- NapCat WebUI：`http://127.0.0.1:6099/webui`；OneBot 服务必须是「正向 WS **服务端**」端口 3001 + HTTP 3000，**Access Token 留空**（若填了，llm-config.cmd 需配 `QQ_ONE_BOT_TOKEN` 一致）
- 所有配置在 `llm-config.cmd`（gitignored，GBK 编码 + CRLF！含 DeepSeek/SiliconFlow key、身份名单、语音参数）
- ⚠️ 直接 `node` 跑脚本不会加载 llm-config.cmd——必须走 `qq-chat.cmd` / `clone-voice.cmd` / `tts-test.cmd` 这类 cmd 包装器（内部先 `call llm-config.cmd`）

## 二、架构（契约 1.0.0-rc.5，所有扩展都是值级）

```
core（骨架，不动）→ composition（装配）→ layers（默认实现）
→ adapters/：llm（认知/记忆/视觉/后处理/切分）、stt（whisper 三引擎+silk 解码）、tts（cloud-tts 克隆音色、audio-pad 拼接/垫静音/慢放/体检）
→ hosts/：chat-host（终端聊天）、qq-host（qq-bot.ts 主逻辑 + qq-messages.ts 解析工具 + kaomoji.ts）、bili-host（弹幕机器人 v1）
→ config/：persona/skeleton.persona.json、world/rules.skeleton.md、reactions/samples.json（当前为空数组）
→ scripts/：whisper-stt.py、audio-inspect.py、audio-pad.py、audio-concat.py、audio-atempo.py、clone-voice.ts、weekly-check.ts、check-descope.ts、gen-handover.ts
```

新接一个平台 = 在 `hosts/` 下再写一个 main（复刻 `qq-bot.ts` 的收发循环），复用 `createChatRuntime`/`sendUserMessage`。

## 三、人格 / 规则 / 记忆：现在怎么填

| 想改什么 | 改哪里 | 说明 |
|---|---|---|
| 名字、性格、开场白 | `config/persona/skeleton.persona.json` | `chara_card_v3` 格式，`data.name` 必填且会用作记忆文件名（建议 ASCII，避免中文文件名麻烦） |
| 世界观、说话方式、红线 | `config/world/rules.skeleton.md` | 整段追加进 system 提示词；改文件不用改代码；也可用 `CHAT_WORLD_RULES` 指到别的 .md |
| 语气校准 few-shot / 自检题集 | `config/reactions/samples.json` | 现在是 `[]`；格式见 `adapters/llm/reaction-samples.ts`（id/situation/reply/expected） |
| 触发词 | `llm-config.cmd` 的 `QQ_TRIGGER` / `BILI_TRIGGER` | 未配置时用占位符 `bot` |
| 谁能用语音 / 谁能发管理指令 | `llm-config.cmd` 的 `QQ_OWNER_IDS` / `QQ_FRIEND_IDS` | 现在**清空了** → 语音回复不触发、`!reset`/`!status` 没人有权限 |
| 记忆 | `data/chat-history/<宿主>/<人格名>.jsonl` | 已全部删除；按人格名分文件，换名字=换一份记忆 |

记忆三层（都在 `adapters/llm/memory/`）：轮次历史 `CHAT_MAX_TURNS=10`、长期事实（重要度×时间衰减，50 条、TTL 30 天）、第一人称感受（强度逐日衰减）。摘要器每 `CHAT_SUMMARY_EVERY` 轮跑一次。

## 四、功能清单（重置后仍全部可用）

| 功能 | 状态 |
|---|---|
| 触发：消息含触发词/@/引用 | ✅（触发词现在默认 `bot`，需在 llm-config 里改） |
| 语音转写：老板/喜欢的人随时；普通群友需先触发（60s 窗口） | ✅ 代码在，但**名单已清空 → 谁都不算 trusted** |
| 她发语音：仅老板/喜欢的人、≤120 字、60s 冷却 | ✅ 同上，需填名单才触发 |
| 图片识别（NapCat get_image → 视觉模型） | ✅ |
| 观察区域/黑名单：冒犯词→观察，3 次拉黑（!reset 清） | ✅ |
| boss 指令 !reset/!clear/!status | ✅（需填 `QQ_OWNER_IDS`） |
| 好友每日首次主动打招呼 | ✅（需填 `QQ_FRIEND_IDS`） |
| 颜文字随机句尾 | ✅（`QQ_KAOMOJI`） |
| 长期记忆：每 N 回合提炼 | ✅ |
| B 站弹幕机器人 v1（HTTP 轮询 gethistory + msg/send） | ✅；v2（礼物/主播语音）未做 |
| 工具调用（ToolRegistry / CognitionOutput.tool_call） | ⚠️ 契约在，**没接线**：一个工具都没注册，也没人执行 tool_call |
| Live2D / VRChat 渲染 | ⚠️ 只有 `adapters/renderers/empty-vrchat-renderer.ts` 空实现 |

## 五、语音管线（2026-11-14 加固版）

```
台词 → 剥动作/命令 → 逐句切分补句读 → 每句云端合成（音色由 TTS_CLOUD_VOICE 决定，原速）
→ 逐句体检（空文件/纯静音/有效语音过短 → 换变体重试；尾部硬切 → 优先选有收尾的那版）
→ 拼接（句间 0.4s，统一 24000Hz）→ 重采样慢放（QQ_TTS_TEMPO；≥0.995 跳过）
→ 头垫 0.3s + 尾垫 0.8s + 峰值归一 0.8 → 发送
任何一句不合格 → 整条落回文字（绝不发半条）；连续 3 条拿不到语音 → 熔断 5 分钟纯文字
```

- 引擎：`TTS_ENGINE=cloud`（SiliconFlow `/audio/speech`）；`TTS_CLOUD_VOICE` 现在**为空** → 回落内置 `FunAudioLLM/CosyVoice2-0.5B:claire`
- 克隆音色：`clone-voice.cmd` 上传参考音频（`data/tmp/voice-ref.txt` 是参考文本）→ 得到 `speech:xxx:yyy:zzz` → 填进 `TTS_CLOUD_VOICE`
- 参数：`QQ_TTS_TEMPO`、`QQ_TTS_GAP=0.4`、`QQ_HESITATION_RATE`（默认 0.12，打顿"嗯，"）、`TTS_CLOUD_SPEED`、`QQ_TTS_LEAD=0.3`、`QQ_TTS_TAIL=0.8`、`QQ_TTS_PEAK=0.8`、`QQ_TTS_TRIES=4`、`QQ_TTS_BUDGET_MS=20000`、`QQ_TTS_BREAKER=3`、`QQ_TTS_BREAKER_MS=300000`、`TTS_CLOUD_TIMEOUT_MS=15000`
- 质量门脚本：`scripts/audio-inspect.py`（时长/峰值/首尾静音/有效语音跨度，输出 JSON）

## 六、已知问题与取舍

1. **云端"克隆音色"通道会间歇性抽风**（2026-11-13 夜实测约 1/4 可用，最差 0/6）：同一句连打会返回 0 字节 / 50507 / 固定 4735B 的纯静音桩；重试成功的产物里约一半尾部被硬切（尾静音 0.002s）。同时刻内置音色 10/10 稳定。已用"逐句体检 + 多变体（原句/前补逗号/语速0.95）重试 + 择优 + 熔断"覆盖，最坏落回文字。
2. **QQ 传输链路已验证无损**：把 QQ 落盘的 silk（`D:\DataC\Documents\Tencent Files\<QQ号>\nt_qq\nt_data\Ptt\<年-月>\Ori\`）解码回来和本地发出的 wav 比对，时长误差 <40ms、包络相关 0.988 → 首尾静音都在，QQ 不截断。**听到残缺一定是产物本身的问题。**
3. 克隆素材若是微信语音（压缩+自然鼻音）→ 慢放会放大"钝/鼻音"；根治=录音机重录 25~30s 干净素材再克隆。
4. 情绪→语音只剩语速映射（happy 1.0 / calm 0.95 / sad 0.85）。
5. NapCat 账号曾被提示异常（风控），需留意登录状态；非官方协议有封号风险，建议专用小号。
6. 记忆按"会话目录 + 人格名"存：`data/chat-history/qq-<群号>/<人格名>.jsonl`。想跨平台/跨群共用记忆，需要改成按人存（未做）。

## 七、待办（按优先级）

1. `git push`（本地领先 origin 若干提交，含本次重置）
2. 重新填充人格：`config/persona/skeleton.persona.json` + `config/world/rules.skeleton.md`（填完跑 `chat.cmd` 试一条）
3. 若要用语音：填回 `TTS_CLOUD_VOICE`（克隆或内置）+ `QQ_OWNER_IDS`/`QQ_FRIEND_IDS`
4. （可选）工具层接线：`CognitionOutput.tool_call → ToolRegistry.invoke`，再补 3~5 个工具（天气/搜索/点歌/日程）
5. （可选）B 站 v2：WS 礼物/大航海事件 + 主播语音转写
6. （可选）多入口（Telegram/Discord/飞书）——先做"记忆按人存"再谈
7. （可选）VOCALOID6 唱歌（无音源）/ Live2D 渲染

## 八、踩坑速查（编码/环境）

- `.cmd` 文件必须 CRLF，且**编码要跟现有文件一致**：`llm-config.cmd` 实测是 **GBK**（里面有人名），改它要用字节级读改写，别用 `Get-Content/Set-Content`
- ⚠️ **不要用 PowerShell 的 `Get-Content/Set-Content` 改仓库里的 .ts/.md**：PS 默认按 ANSI(GBK) 读，UTF-8 中文会被写成乱码；仓库里也确实有 GBK 编码的老文件（如 `tests/unit/silk-decode.test.ts`）
- `.ps1` 需要 UTF-8 **BOM**（Windows PowerShell 5.1）
- cmd 批处理会吞行尾 `%`（"-5%"→"-5"）——参数读取端已做归一化防御
- ⚠️ **沙箱里跑不了 tsx/vitest**（esbuild 要 spawn 子进程 → EPERM）。沙箱内能做的验证：`npx tsc --noEmit` + 直接跑 `scripts/*.py`（PyAV 本地可用）
- QQ 落盘的语音文件头常是 `02 #!SILK_V3`（0x02 打头）→ 判断魔数要在前 10 字节里找 `#!SILK_V3`
- `silk-wasm` 3.x 的 `decode()` 返回 `{data, duration}`（不是 Int16Array）
- 用户 Python 3.14 环境：venv 在 `tools/whisper-py`；faster-whisper/pilk/yt-dlp 均经清华镜像安装
- 本机硬件：Ryzen 5 5600H + 核显（无独显）+ 远程桌面虚拟显示 → VRChat / 本地 GPU 类需求不可行
