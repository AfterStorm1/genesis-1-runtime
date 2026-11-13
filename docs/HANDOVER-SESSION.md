# 会话交接文件（蕙 · QQ 群机器人 + 语音）

> 给下一个会话/接手的 AI 或人。更新于 2026-11-13 深夜。
> 新会话开场白：**「读 D:\Whale-chan\Hui\runtime\docs\HANDOVER-SESSION.md 后继续」**

## 一、项目与启动

- 项目根：`D:\Whale-chan\Hui\runtime`（git 仓库，本地领先 origin/main 130+ 提交，**待 push**）
- 启动顺序：① NapCat（`D:\ruanjian\NapCat.Shell.Windows.Node\napcat.bat`，QQ 登录）→ ② `qq-chat.cmd`（机器人）
- NapCat WebUI：`http://127.0.0.1:6099/webui`；OneBot 服务必须是「正向 WS **服务端**」端口 3001 + HTTP 3000，**Access Token 留空**（若填了，llm-config.cmd 需配 `QQ_ONE_BOT_TOKEN` 一致）
- 所有配置在 `llm-config.cmd`（gitignored，含 DeepSeek key、SiliconFlow key、身份名单、语音参数）
- ⚠️ 直接 `node` 跑脚本不会加载 llm-config.cmd——必须走 `qq-chat.cmd` / `clone-voice.cmd` / `tts-test.cmd` 这类 cmd 包装器（内部先 `call llm-config.cmd`）

## 二、架构（契约 1.0.0-rc.5，所有扩展都是值级）

```
core（骨架，不动）→ composition（装配）→ layers（默认实现）
→ adapters/：llm（认知/记忆/视觉/后处理/切分）、stt（whisper 三引擎+silk解码）、tts（cloud-tts 克隆音色、audio-pad 拼接/垫静音/慢放）
→ hosts/：chat-host（终端聊天）、qq-host（qq-bot.ts 主逻辑 + qq-messages.ts 解析工具 + kaomoji.ts）、bili-host（弹幕机器人 v1）
→ config/：persona/hui.persona.json、world/hui-rules.md、world/memes.md、reactions/samples.json
→ scripts/：whisper-stt.py（含 convert/pilk silk 解码）、tts-edge.py 已删、audio-cut.py、audio-pad.py、audio-concat.py、audio-atempo.py（现在是重采样慢放）、clone-voice.ts、weekly-check.ts、gen-handover.ts
```

## 三、蕙的永久层（清记忆不变）

- 人格卡：白腿小隼实习生；开场白「Ciallo～ (∠・ω< )⌒★…」；性格=话少稳重、正面情绪对喜欢的人除外、不找伴侣
- 规则 hui-rules.md 关键节：场景框架 → 你是谁 → 生活面（刷b站/翻唱，暂禁贴吧微博小红书）→ 重要的事（爱与灯塔给她看自己的样子，提起必道谢）→ 身份与权限 → 说话方式（15~40 字、口误、颜文字、声线描述）→ 回复前内部检查（个人记忆四条件）→ 日常行为 → 红线（含观察/黑名单）→ 记忆规范 → 终止互动（代码强制）
- 身份：老板 2869769650；喜欢的人=绿/苔绿Tars(3323546045)、诺(171581863)、爱与灯塔(2251895469)、星见小鹿(3996514093)；消息注记=「（×××说）」轻量标记
- 梗词典 memes.md：2020~2026 覆盖，懂而不主动用
- 表情包固定搭配库：已按需求**删除**，勿重建

## 四、QQ 群功能清单（当前全量）

| 功能 | 状态 |
|---|---|
| 触发：消息含「蕙」/@/引用她的话 | ✅ |
| 语音转写：老板/喜欢的人随时；普通群友需先触发（60s 窗口） | ✅ |
| 她发语音：仅老板/喜欢的人、≤120 字、60s 冷却 | ✅ |
| 图片识别：触发后窗口内下一张图（NapCat get_image 本地读→视觉模型 base64） | ✅ |
| 观察区域/黑名单：冒犯词→观察，3 次拉黑（!reset 清） | ✅ |
| boss 指令 !reset/!clear/!status | ✅ |
| 好友每日首次主动打招呼 | ✅ |
| 颜文字：happy≥0.55 时句尾随机，5 分钟一次 | ✅ |
| 长期记忆：每 8 回合提炼（QQ_SUMMARY_EVERY） | ✅ |
| B 站弹幕机器人 v1（bili-chat.cmd，HTTP 轮询 gethistory + msg/send） | ✅；v2（礼物/主播语音）未做 |

## 五、语音管线（最终版，2026-11-13 定稿；次日凌晨加固）

```
台词 → 剥动作/命令 → 逐句切分补句读 → 每句云端合成（克隆音色，原速）
→ 逐句体检（空文件/纯静音/有效语音过短 → 换变体重试；尾部硬切 → 优先选有收尾的那版）
→ 拼接（句间 0.4s 停顿，统一 24000Hz）
→ 重采样慢放（QQ_TTS_TEMPO；≥0.995 直接跳过，白转一次没必要）
→ 头垫 0.3s + 尾垫 0.8s + 峰值归一到 0.8 → 发送
任何一句拿不到合格产物 → 整条落回文字（**绝不发半条**）
```

- 引擎：仅 SiliconFlow 云端（`TTS_CLOUD_VOICE=speech:hui-voice:…` 克隆音色；`TTS_ENGINE=cloud`）；**微软 Edge 语音已彻底移除**
- 参数：`QQ_TTS_TEMPO`（慢放倍率；<1 时音高随之下沉——0.85 会显呆/鼻音重，1.0 听感最优）、`QQ_TTS_GAP=0.4`、`QQ_HESITATION_RATE=0.12`（12% 概率开头「嗯，」）、`TTS_CLOUD_SPEED=1.0`
- 新增（防首尾被吃）：`QQ_TTS_LEAD=0.3`（头垫静音）、`QQ_TTS_TAIL=0.8`（尾垫静音）、`QQ_TTS_PEAK=0.8`（峰值归一，云端各音色音量差 3 倍）、`QQ_TTS_TRIES=4`（每句变体/重试次数）
- 新增（防干等）：`QQ_TTS_BUDGET_MS=20000`（一条回复最多在语音上花 20s，超时落文字）、`QQ_TTS_BREAKER=3`（连续 3 条都拿不到语音就熔断）、`QQ_TTS_BREAKER_MS=300000`（熔断 5 分钟期间纯文字，到点自动再试）、`TTS_CLOUD_TIMEOUT_MS=15000`（单次请求超时，防偶发挂起把回复拖到一分钟）
- 克隆：`clone-voice.cmd`（自动读 data/tmp/voice-ref.txt 生成基准→上传）；克隆音色路径：上传参考音频→uri→填 TTS_CLOUD_VOICE


## 六、已知问题与取舍

0. **（2026-11-13 深夜排查结论）"QQ 语音不完整、开头结尾听不到" 的真相 = 云端合成产物本身就残缺，不是 QQ 截断**
   - 已证明传输无损：把 QQ 落盘的 silk（`D:\DataC\Documents\Tencent Files\<QQ号>\nt_qq\nt_data\Ptt\<年-月>\Ori\<md5>`）解码回来和发出的 wav 比对，时长误差 <40ms、包络相关系数 0.988（含 0.5s 头静音和 0.5s 尾静音都在）
   - 真正的凶手：同一句连打 8 次，**6 次拿到空响应**（200 + 0 字节）、或 50507、或固定 4735 字节的「0.22s 纯静音」桩；重试成功的那个又常常**尾部被硬切**（尾静音 0.002s，最后一个字被吞）
   - 同一时刻内置音色（alex/anna/bella/claire/diana）**10/10 稳定**，时长 2~3.2s、尾静音 0.27~0.47s → **是克隆音色通道在抽风**（重克隆换 uri 也一样，1/5 可用），不是网络/风控/参数问题
   - 23:20 复查（同一分钟对照）：克隆 `0/6`（全 0 字节或 5503/6655B 静音桩）、内置 claire `3/3` 正常（1.9~2.7s）。管线日志里那些「质检不合格（silent）」的文件实测 **peak=0.0、0.048~0.576s 纯静音** —— 质检没冤枉，云端确实吐空音频；而 23:13 那条成功的语音是 4.94s、尾静音 0.185s，说明是间歇性（约 1/4 可用）
   - 已做的加固：逐句体检（空/静音/有效语音过短/尾硬切择优）+ 多变体重试（原句 / 前补逗号 / 语速0.95）+ 任何一句不合格整条落文字 + 头尾垫静音 + 24k 统一 + 峰值归一
   - 待用户决定：等克隆通道恢复（坏的时候自动落文字）还是换内置音色（立刻稳定，但不是她的克隆声）
1. **云端会间歇性吐截断/损坏 mp3**（50507 / 0.05s 短音频 / 0 字节 / 纯静音桩）——已用逐句体检+多变体重试覆盖；最坏落回文字
2. **克隆素材是微信语音**（压缩+自然鼻音）→ 慢放会放大「钝/鼻音」；根治=手机录音机重录 25~30s 干净素材（非微信）再 `clone-voice.cmd` 覆盖
3. 用户最终取向：**听感优先，不模仿人设声线**（原速原音高）
4. 情绪→语音：云端仅剩语速映射（happy 1.0/calm 0.95/sad 0.85 在 TTS 内；情绪指令会污染语音已弃用）；QQ 端用 QQ_TTS_TEMPO 统一慢放
5. NapCat 账号曾被提示异常（风控），需留意登录状态


## 七、待办（按优先级）

1. `git push`（本地领先 130+ 提交，含全部功能）
2. **定音色策略**：克隆通道恢复前，语音会经常退化成文字；要么等，要么 `TTS_CLOUD_VOICE` 换内置音色（`FunAudioLLM/CosyVoice2-0.5B:claire` 干净利落、`:bella`/`:diana` 更软）
3. 重启 `qq-chat.cmd` 让新语音管线生效（旧进程还是老代码）
4. （可选）高质量素材重克隆，改善音质
5. （可选）B 站 v2：礼物/大航海事件（WS 协议 bilibili-live-ws）、主播声音转写（FLV 抓流+持续 STT）
6. （可选）GPT-SoVITS 云端模型切换：TTS_CLOUD_MODEL 换模型名测试


## 八、踩坑速查（编码/环境）

- `.cmd` 文件必须 ASCII + CRLF（含中文会乱码）；`chcp 65001` 在 call llm-config 之前
- `.ps1` 需要 UTF-8 **BOM**（Windows PowerShell 5.1）
- cmd 批处理会吞行尾 `%`（"-5%"→"-5"）——参数读取端已做归一化防御
- ⚠️ **不要用 PowerShell 的 `Get-Content/Set-Content` 改仓库里的 .ts/.md**：PS 默认按 ANSI(GBK) 读，UTF-8 中文会被写成乱码；而且仓库里确实有 GBK 编码的老文件（如 tests/unit/silk-decode.test.ts），读出来是乱码不代表文件坏了。改文件只用编辑器/专用工具
- ⚠️ **沙箱里跑不了 tsx/vitest**（esbuild 要 spawn 子进程 → EPERM）。沙箱内能做的验证：`npx tsc --noEmit` + 直接跑 `scripts/*.py`（PyAV 本地可用）
- QQ 落盘的语音文件头常是 `02 #!SILK_V3`（0x02 打头）→ 判断魔数要在前 10 字节里找 `#!SILK_V3`；只看第 0 字节会把收到的所有语音判成"不是 silk"而不去解码
- `silk-wasm` 3.x 的 `decode()` 返回 `{data, duration}`（不是 Int16Array）——写回 wav 前要取 `.data`
- 诊断神器：QQ 自己的语音原件在 `D:\DataC\Documents\Tencent Files\<QQ号>\nt_qq\nt_data\Ptt\<年-月>\Ori\`，能 decode 出来和本地发出的 wav 做时长/包络比对 → 一句话分清"是传输截断还是产物本身残缺"
- 用户 Python 3.14 环境：venv 在 `tools/whisper-py`；faster-whisper/pilk/edge-tts(已不需要)/yt-dlp 均经清华镜像安装
- QQ 语音文件：#!SILK_V3 用 silk-wasm 解码（Node 侧）
- 沙箱无外网：所有联网操作给用户 cmd 包装器执行；本地 PyAV 音频处理可沙箱直测（例外：本会话验证过沙箱内 `fetch` 能直连 api.siliconflow.cn）

