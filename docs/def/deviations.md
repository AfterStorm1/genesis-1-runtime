# 偏差清单（与附件 A v1.0.0-rc.5-r1 不一致处）

无契约语义偏差（字段名 / kind / actualPath / payloadShape / dispose 顺序 / 22 个入口均逐字实现）。
以下为**工程性偏差**（实现位置、示意代码取舍、补充字段），全部经用户确认或属手册「至少包含 / 代码为示意」授权范围。

| # | 偏差 | 依据 | 处理 |
| --- | --- | --- | --- |
| D-1 | `ToolRegistry.register` 校验点为 impl 内部唯一调用点，compose 不重复前置校验（§4.2 片段中的显式调用未实现） | 用户 Q4 确认；§3.5 契约注释「内部调 validateAt」；附录 C「代码为示意，不作为最终实现」；A02「注册期项每个组件实例只校验一次」 | impl 内校验；`CapabilityLedger.register` / `L35.attachTrackingSource` 同类处理 |
| D-2 | 支撑类型（PersonaCardV3 / MemoryStore / RecallResult / CognitionContext / WorldSnapshot / WorldDelta / Logger / WorldEntity / ToolHandler / ContractMigratorEntry / JSONSchema / InputBus / SignalDispatcher / RendererRegistry / FeedbackChannel）按最小必要字段实现，标注 `// minimal per handbook; confirm` | 任务书 §5 授权 + 用户 Q3 确认 | 全部列入 `pending-types.md` |
| D-3 | `core/contract/speech.ts` 内含 `isSanitizedText` / `markSanitized` / WeakSet 运行态 | 手册把该函数声明在 speech.ts 且要求「WeakSet miss → false」严格语义（S-06 / D43）；WeakSet 是 brand 契约的一部分 | 作为「类型即契约」受控实现留在契约文件；其余契约文件不含实现 |
| D-4 | 补充文件：`core/id-factory.ts`、`core/runtime.ts`、`core/scheduler/frame-channel-impl.ts`（FrameChannel 实现位置）、`core/migrate/contract-registry-impl.ts`（ContractRegistry 实现位置）、`core/contract/entry-points.ts` 内含 `SampledValidator` 与 `__validateAt_count` 埋点 | 手册 4.1 目录为「至少包含」；埋点为 A02 证据要求 | 已记录 |
| D-5 | compose 返回 bundle 增加 `inputBus` 与 `feedback` 字段 | 手册 4.2 片段未列，但 §8.2 e2e 第 1 步要求 `InputBus.inject` 可达、A14/A16 断言需观察 FeedbackChannel | 补充字段；不改变既有字段语义 |
| D-6 | compose 增加 `cognition.mount(...)` 调用（await） | Cognition 契约要求 mount 生命周期；手册 4.2 片段未展示 | 在 pipeline 创建前调用；失败即 compose 失败 |
| D-7 | dispose 链不含 `cognition.dispose()` 与 `scheduler.dispose()`（严格按手册步骤表） | 禁止改 dispose 顺序 | cognition 为宿主注入对象，由宿主（main.ts 等）处置；scheduler 的时钟订阅由 `clock.frameSource.stop()`（clock 步）清空 tick 监听兜底，`scheduler.dispose()` 保留供宿主显式调用 |
| D-8 | 帧循环启动方：`scheduler.attachTrackingSource` 触发 `clock.frameSource.start()` | 手册未指定谁启动 FrameSource；不启动则体感最小链路无法运行 | 骨架行为；已注释 |
| D-9 | `consumeIterator` 在迭代器抛错时丢弃已收 outputs（整批失败） | 附件 A 3.8 规则 5「整批失败，不产 signal」优先于 4.4 示意片段（示意代码无条件 push buf） | 规则 5 实现；示意片段按附录 C「不作为最终实现」处理 |
| D-10 | `SpeechSessionStore.onRelease` 的 reason→state 映射（completed/feedback_done→done；feedback_error→failed；其余→interrupted）为骨架最小约定 | 手册只写死 feedback 映射表，未给 arbiter release 侧映射 | 列入待确认清单 |
| D-11 | 默认仲裁策略取值：`channelOf` = speech ? "speech" : "motion"；`shouldInterrupt` = 高优先级且当前可中断；`isReleasable` = true | 手册给接口未给默认策略行为 | minimal，列入待确认清单 |
| D-12 | `InputBus.inject/injectSnapshot` 对缺省 `contractVersion` 的输入按当前契约版本补齐后再校验 | §8.2 e2e 第 1 步 `InputBus.inject({kind:"user_message",text:"hi"})` 无版本字段 | 实现侧补齐；显式传坏版本仍会被拒绝（有测试） |
| D-13 | `createDefaultFusionStage` 为无行为最小实现；`SpatialIntent` 不做运动学映射（axes 恒 0） | 任务书 2.2 明确不实现真实体感行为；插槽语义零变更 | 列入待确认清单 |
| D-14 | 本地验证：依赖经用户手动安装后，用 node_modules 内 tsc/vitest/tsx 直跑（不经 pnpm 命令）；pnpm 脚本保留在 package.json 供正常环境使用 | 本机 pnpm 网络栈 10013 且沙箱内子进程无网络；npm install 可用（生成 package-lock.json） | 已向用户说明；`verify.cmd` 一键复验 |
| D-15 | `Scheduler.dispose()` 未进入 compose dispose 链（见 D-7），由 clock 步兜底；`SampledValidator` 实例随 composition 闭包存活 | 手册 dispose 表无 scheduler 步 | 已记录 |
| D-16 | 测试统一使用自写 `waitForTruthy` 真值轮询助手，不使用 `vi.waitFor` | vitest 的 `vi.waitFor` 语义是「等到回调不抛异常」而非「等到返回真值」，会瞬间通过造成断言提前 | tests/helpers/fixtures.ts |
| D-17 | A09 测试使用原生 Cognition 直接返回可控 AsyncIterable | 经 mock cognition 的 toIterable 包装后，pipeline 的 `return()` 落在悬停中的外层 async generator 上，其 return 完成信号需内部 await 结算才被处理，导致观察不到 return 调用；手册已知局限 4 亦指出取消依赖适配器正确实现 return() | 测试注释已说明 |
| D-18 | A07 基准「慢回调阻塞」窗口 20ms、判定阈值 0.8×（手册未规定测量参数） | 5ms 窗口在繁忙机器上计时抖动会造成误报 | 仅证据脚本参数，非契约 |
| D-19 | 交付目录含 `verify.cmd`（本地一键复验）、`chat.cmd`（聊天入口）与 `package-lock.json`（npm 安装产物） | 本机 pnpm 无法联网安装；npm 路径的锁文件随交付保留，CI 模板仍用 pnpm | 已记录 |
| D-20 | 对话功能（值级扩展）：`adapters/llm/openai-compatible-cognition.ts`（本地 Ollama / 在线 API 双模式，含标记行格式解析）、`adapters/llm/in-memory-history-store.ts`（对话记忆，经契约预留的 MemoryStore→recall 路径注入）、`demo-chat.ts`（导出 createChatRuntime/sendUserMessage/runChatLoop 供其他宿主复用） | 任务书 9.1「新增能力只加 adapters/」；全部不动 core/contract/ | 已记录；初始名 ollama-cognition.ts 已正名 |
| D-21 | 三级对话记忆 + 遗忘机制（值级扩展）：`adapters/llm/long-term-memory.ts`（LLM 提炼/容量淘汰/TTL/显式遗忘/归档回滚）、`adapters/llm/chat-memory.ts`（组合 MemoryStore）、`adapters/llm/summarizer.ts`（复用 chatOnce 的摘要器）；长期条目以 `recall.items` 中 `role:"memory"` 传递，适配器并入 system 提示词 | RecallResult.role 为最小类型（string），未扩展契约 | 已记录 |
| D-22 | 主角「蕙」设定落地（值级扩展）：人格卡 `config/persona/hui.persona.json` + 规则 `config/world/hui-rules.md`（随 prompt 注入）；语言过滤表由 `adapters/llm/speech-postprocess.ts` 输出侧强制（不进 prompt）；最高优先级终止规则由 `adapters/safety-guard/termination-hook.ts` 经 PipelineHook 插槽输入侧强制（越界→永久终止，只回“连接中断...”）；chat.cmd 默认人格改为 hui | 全部不动 core/contract/ | 已记录 |
| D-23 | 流式输出（值级扩展，渲染层实现）：`adapters/llm/speech-segmenter.ts`（≤25 字原子/语义边界切分，蕙流式规格）+ `adapters/renderers/streaming-text-renderer.ts`（逐字/句间节奏打字机，dispose 取消、busy 重入保护、whenIdle）；适配器输出改为「切分→逐句后处理→换行连接」，渲染器按行流式打印；CHAT_STREAM=0 可回退整段打印 | 一个回复仍是一个 signal（仲裁/会话语义不变）；真·token 级提前输出需 pipeline 批次语义演进（形状级），未实现 | 已记录 |
| D-24 | TTS 语音输出（值级扩展）：`adapters/tts/sapi-speaker.ts`（Speaker 抽象 + Windows SAPI 实现，零安装离线，经 PowerShell 子进程朗读）+ `adapters/renderers/tts-speech-renderer.ts`（复用既有 feedback 回路：audio_started→朗读→audio_done；失败→signal_error；新信号打断旧朗读）；demo 默认开启（CHAT_TTS=0 回退静音 Mock，CHAT_TTS_RATE 调语速） | 未动 feedback 契约（原判定“形状级”实为误判：既有 audio_started/audio_done 语义足够承载同步 TTS）；v1 局限：SAPI 整段朗读、中断仅停止朗读不改旧会话状态、音质为系统合成音；后续 edge-tts/piper 可替换 Speaker 实现 | 已记录 |
| D-25 | 情绪状态机（轻量 InternalDrive，值级扩展）：`adapters/drive/emotion-state-machine.ts`（情绪+强度+VAD、事件转移表、时间衰减、波动超阈值且过冷却 → DriveIntent(self_talk)）+ `adapters/drive/emotion-bias-hook.ts`（beforeCognition 注入情绪注记）；demo 每 60s tick 并把 self_talk 经 `pipeline.handleInput(drive_intent)` 送入 LLM（自主开口）；CHAT_EMOTION=0 关闭 | 复用契约预留的 InternalDrive/DriveIntent，未扩展契约；事件分类为关键词表初版，可换分类器；self_talk 优先级 20（低于用户驱动） | 已记录 |
| D-26 | 记忆第一人称感受层（值级扩展）：`adapters/llm/feeling-memory.ts`（感受库：情绪词+强度、强度逐日衰减、低过 0.1 自动归档、容量 20/TTL 14 天）+ `adapters/llm/chat-memory.ts` 合并注入（role="feeling" 排最前）+ 适配器新增「记忆中的感受——第一人称」system 块；摘要器一次调用同时提炼 [事实] 与 [感受] 两节；/记忆 分两栏展示 | RecallResult.role 仍为最小类型（string），未扩展契约 | 已记录 |
| D-27 | STT 语音输入（值级扩展）：`adapters/stt/sapi-speech-recognizer.ts`（SpeechRecognizer 抽象 + Windows SAPI DictationGrammar 实现，零安装离线，经 PowerShell 子进程同步识别一句）；demo 聊天命令 `/说` 触发（识别文本走与打字完全相同的回复/情绪/记忆路径）；CHAT_STT_LANG 换识别语言区域 | 未动输入契约（识别结果是普通 user_message）；依赖系统中文语音识别语言包（未装则明确报错）；识别质量受系统引擎限制，后续可换 Whisper/云 STT | 已记录 |
| D-28 | 反应样本库 + 每周自检（值级扩展）：`config/reactions/samples.json`（12 条情境→标准反应+验收关键词）、`adapters/llm/reaction-samples.ts`（加载校验/few-shot 注入/关键词判定）；样本作为语气校准 few-shot 进 system 提示词（localOnly 条目除外）；`scripts/weekly-check.ts` + `weekly-check.cmd`（9 步自检：typecheck/单测/e2e/配置/终止钩子/LLM 连通/反应评测/记忆健康/git，报告固定写 docs/evidence/weekly-check-latest.md + 日期归档；硬失败退出码 1） | 全部不动 core/contract/；反应评测为关键词级粗评（非语义评测），样本库可随时扩充 | 已记录 |
| D-29 | 架构整理（纯重构，行为零变更）：`demo-chat.ts` 瘦身为入口薄壳；新增 `hosts/chat-host/`（chat-env 配置集中读取 / memory-assembly 记忆装配 / chat-runtime 运行时组装+sendUserMessage / chat-loop 终端循环，barrel 导出）；记忆四件套迁至 `adapters/llm/memory/`（含 barrel），各引用方 import 同步更新 | 契约与行为不变；demo-chat 保留原导出路径（back-compat） | 已记录 |
