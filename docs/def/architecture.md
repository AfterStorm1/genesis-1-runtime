# Genesis-1 架构总览与查询索引

> 契约权威：附件 A《Genesis-1 角色运行时骨架手册（整理版）v1.0.0-rc.5-r1》（契约候选 rc.5）。
> 本文只做「查什么看哪里」的索引与扩展配方，不新增契约语义。

## 1. 一句话数据流

```
InputBus.inject(user_message)
  → EventBus(input.delta) → pipeline.onEvent
  → toCognitionInput（persona 经 Cognition 适配器注入）
  → validateAt(Cognition.onInput)
  → MemoryStore.recall（超时 50ms）→ input.recall
  → Cognition.onInput（LLM/感知/驱动 适配器）→ AsyncIterable<CognitionOutput>
  → consumeIterator（逐 item validateAt；超时/超限 return()；抛错整批失败）
  → l3Tick：enforceSpeech(sanitize) → 默认 aggregator（不经 Hub）→ Hub.flush（额外源）
  → validateAt(L3.aggregate.output + L3.dispatch) → arbiter.submit
     （首行 clampPriority → enforceSignalRate → id 校验 → watchdog 挂账）
  → onDispatch：speech.create（G-02）→ SignalDispatcher 全量广播
  → Renderer.apply（text / speech / vrchat…）
  → FeedbackChannel：audio_started/audio_done/interrupted/signal_error → speech CAS + arbiter.notifyRelease
  → dispose：17 步固定顺序（arbiter.dispose() → unsubDispatch → unsubRelease → speech.dispose() …）
```

高频体感链（与上面并行）：`TrackingSource.channel → Scheduler(FusionStage) → enforceActuatorFrame → FrameChannel<ActuatorFrame> → 仅 consumesFrames 的 Renderer.applyFrame`。

## 2. 「我想改 X，看哪里」索引

| 你想做的事 | 看/改这里 | 档位 |
|---|---|---|
| 换人格 | `config/persona/*.json` + 环境变量 `GENESIS_PERSONA` | 值 |
| 接/换 LLM（本地 Ollama / 在线 API） | `adapters/llm/openai-compatible-cognition.ts` | 值 |
| 对话记忆（多轮上下文） | `adapters/llm/in-memory-history-store.ts`（经 `RuntimeConfig.memory` 注入） | 值 |
| 聊天入口 | `demo-chat.ts`（可复用运行时）+ `chat.cmd`（双击） | 值 |
| 加一种 Renderer（新呈现方式） | `adapters/renderers/`（实现 `Renderer`，声明 `capabilities.contractRanges`） | 值/形状 |
| 加一种感知源 | `adapters/perception/`（`TrackingSource` 或 InputBus 事件） | 值 |
| 加工具（角色可调用） | `RuntimeConfig.tools`（ToolDefinition + handler，注册即校验） | 值 |
| 加横切逻辑（过滤/改写） | 插槽 2：`PipelineHook`（beforeCognition…afterArbiter，HookContext 只读） | 值 |
| 加额外信号源（定时动作等） | 插槽 1：`ExpressionSource` → `sourceHub.register` | 值 |
| 契约迁移（老数据升级） | 插槽 3：`ContractMigratorEntry`（幂等纯函数） | 形状 |
| 组件能力声明/依赖 | 插槽 4：`CapabilityLedger.register` | 值/形状 |
| 改任何跨层字段/接口 | `core/contract/`（必须升版本 + 更新 VALIDATE_AT + 注册 migrator） | 形状/拓扑 |
| 查「哪里校验什么」 | `core/contract/entry-points.ts`（VALIDATE_AT 22 项唯一权威表） | — |
| 查「dispose 顺序/装配顺序」 | `composition/composition-root.ts` | — |
| 查「验收标准/证据」 | `docs/evidence/`（A01a–A17 + ci-status.md） | — |
| 查「已知偏差/待确认」 | `docs/def/deviations.md` / `docs/def/pending-types.md` | — |

## 3. 目录地图

```
runtime/
├── core/                     骨架本体：不 import adapters/、layers/
│   ├── contract/             27 个契约文件 + entry-points.ts（VALIDATE_AT）
│   ├── pipeline.ts           handleInput / consumeIterator / l3Tick（主管道唯一实现）
│   ├── arbiter/ dispatch/ clock/ tool/ safety/ motion/ parameter/
│   ├── speech/ feedback/ bus/ migrate/ schema/ hook-chain/
│   ├── source-hub/ input-bus/ scheduler/ component/
│   ├── principal.ts  id-factory.ts  runtime.ts
├── composition/composition-root.ts   唯一装配点（compose/dispose）
├── layers/                   可替换的默认实现
│   ├── l1-persona/           persona-loader
│   ├── l2-cognition/         mock-cognition（演示/测试）
│   ├── l3-expression/        aggregator-default（默认合并规则 1–12）
│   ├── l3-arbiter/           strategy-default（channelOf/shouldInterrupt）
│   └── l35-scheduler/        fusion-default
├── adapters/                 值级扩展的落脚点（契约零改动）
│   ├── llm/                  openai-compatible-cognition（双模式 LLM）
│   │                         in-memory-history-store（对话记忆）
│   │                         empty-cognition
│   ├── renderers/            text / mock-speech / empty-vrchat
│   └── perception/           empty-tracking-source / mock-internal-drive
├── config/persona/           人格卡（example / kaguya）
├── main.ts                   12 步 e2e demo（A14）
├── demo-chat.ts              交互式聊天（导出 createChatRuntime / sendUserMessage / runChatLoop）
├── chat.cmd / verify.cmd     一键入口 / 一键复验
├── tests/                    24+ 测试文件（A01a–A17 映射见各文件头注释）
├── scripts/                  scan-validate-at / payload-shape / bench ×2 / gen-evidence
└── docs/def/ docs/evidence/  deviations / pending-types / architecture / 证据产物
```

## 4. 扩展配方（常用四例）

### 4.1 接一个新 LLM 服务

1. 复制 `adapters/llm/openai-compatible-cognition.ts` 逻辑或直接配置它：
   `createOpenAiCompatibleCognition({ persona, baseUrl, model, apiKey })`；
2. 协议非 OpenAI 兼容时：新适配器只需实现 `Cognition` 接口
   （`mount(ctx)` / `onInput(input): AsyncIterable<CognitionOutput> | Promise<CognitionOutput>` / `dispose()`），
   输出 `contractVersion = COGNITION_CONTRACT_VERSION` 的 emotion/speech/tool_call/state_update；
3. 通过 `RuntimeConfig.cognition` 或宿主装配注入；pipeline 会自动校验与聚合。

### 4.2 对话记忆（三级体系，全在 adapters/llm/，值级）

| 层 | 实现 | 行为 | 遗忘机制 |
|---|---|---|---|
| 短期轮次 | `in-memory-history-store.ts` | 逐字历史 JSONL 持久化；提示词取最近 N 轮 | 滑出提示词但文件保留 |
| 长期记忆 | `long-term-memory.ts` | LLM 每 N 轮提炼事实入库；注入 system 提示词 | 容量上限（评分淘汰）+ TTL（30 天未用且不重要）+ `/忘记` 显式遗忘；**只归档不删除，可回滚** |
| 组合 | `chat-memory.ts` | 实现 MemoryStore：一次 recall = 长期条目（role="memory"）+ 最近轮次 | 经契约预留路径注入，无需改契约 |

接入方式：`RuntimeConfig.memory = createChatMemory({ turns, longTerm })`——
pipeline 自动在 `handleInput` 里带超时调用 `recall` 并把结果放进 `input.recall`；
适配器侧 `buildMessages` 把 role="memory" 条目并入 system、轮次按序注入。

### 4.3 给角色加一个工具（如查天气）

```ts
const rt = await compose({
  ..., 
  tools: [{
    def: { contractVersion: TOOL_CONTRACT_VERSION, name: "get_weather",
           description: "查询城市天气", schema: { type: "object", required: ["city"] },
           permission: "read", scopes: [] },
    handler: async (args) => ({ city: (args as {city:string}).city, weather: "晴" }),
  }],
});
// LLM 适配器输出 { kind: "tool_call", invocation: {...} } 即可触发（pipeline 暂未自动执行 tool_call，
// 宿主可监听 CognitionOutput 自行 invoke；自动执行回路为后续形状级工作）。
```

### 4.4 把聊天挂到别的界面（Web/QQ/Telegram）

复用 `demo-chat.ts` 导出的 `createChatRuntime()` + `sendUserMessage(chat, text)`：
它们是纯函数式接口，不依赖终端；终端循环只是其中一个宿主（`runChatLoop`）。

## 5. 铁律速查（实现时最常踩的 10 条）

1. core/ 不 import adapters/、layers/；唯一装配点 composition/。
2. 跨层只走契约；L4 只读 `speech.sanitizedText.text`。
3. 高频帧走 FrameChannel，不在 dispatchFrame/applyFrame 里 validateAt。
4. 每个 validateAt 调用的 entry 必须在 VALIDATE_AT 表中（22 项，当前无 optional）。
5. 安全只收紧（mergeSafetyDefaults）；devOnly 直通仅非生产。
6. 状态转换 CAS 同步；先到先赢；arbiter.dispose 同步完成全部 onRelease(cancelled)。
7. dispose 顺序固定 17 步；sharedBus 不 dispose；失败聚合 AggregateError。
8. 默认 aggregator 由 l3Tick 直调，不经 Hub；Hub 不持有 arbiter/dispatcher。
9. 全局唯一 id：runtimeId:sourceId:monotonic 或 UUIDv7。
10. 扩展先按「值/形状/拓扑」三档判定；不确定按更高档 + DEF 打分。
