# Genesis-1 角色运行时骨架（契约候选 v1.0.0-rc.5）

> 状态：内部受控测试候选；**不是 v1.0.0**；A01a–A17 尚未全量 CI 绿。
> 本仓库只交付骨架：契约、强制点、装配链、测试矩阵、最小 demo 与空壳适配器；
> 不实现真实 LLM / Live2D / VRChat / TTS / 体感设备行为保证。

一句话定性：**骨架定「今天长什么样」，插槽定「明天能长什么」，判定表定「哪些明天不该长进来」。**

## 目录

- `core/` —— 契约（`core/contract/`）与强制点实现；不 import `adapters/`、`layers/`
- `composition/` —— 唯一装配点（compose / dispose 固定顺序）
- `layers/` —— L1 persona / L2 mock cognition / L3 默认聚合器与仲裁策略 / L3.5 默认融合
- `adapters/` —— 文本渲染器、Mock 语音渲染器、空壳 VRChat、空壳体感源、空壳认知、Mock 自主驱动
- `config/persona/` —— 人格卡数据（换人格只换这里 + 宿主装配数据）
- `tests/` —— A01a–A17 对应单测与 e2e
- `scripts/` —— VALIDATE_AT 扫描、payload 形状报告、基准、证据汇总
- `docs/evidence/` —— 证据产物（本地 pass / CI pending）
- `docs/def/` —— 偏差清单与待确认类型清单
- `main.ts` —— 最小 demo（12 步 e2e，输出 `docs/evidence/e2e-minimal.log`）

## 运行

```bash
pnpm install          # Node 20+；安装 TypeScript / Vitest / tsx
pnpm typecheck        # tsc --noEmit
pnpm test             # 单测（A03/A04/A05/A06/A07/A08/A09/A10/A11/A12/A13/A15/A16/A17 等）
pnpm test:e2e         # A14 端到端最小链路
pnpm scan:validate-at # A01a：validate-at-scan.json + callgraph-report.md
pnpm scan:payload-shape  # A01b：payload-shape-report.json
pnpm bench:slots      # A12：slots-bench.json
pnpm bench:frame-channel # A07：frame-channel-bench.json
pnpm evidence         # 证据索引
pnpm demo             # 直接跑 main.ts（12 步 e2e + 写 log）
```

> 本机验证记录：本会话交付时，本机 pnpm 的网络栈对 npm 仓库直连报 WSAEACCES(10013)
> （与 Hyper-V 端口保留区间重叠有关），最终用 `npm install --registry=https://registry.npmjs.org`
> 安装，并以 `verify.cmd`（依次执行 typecheck / 单测 / e2e / 扫描 / 基准 / demo，结果写入
> `docs/evidence/verify.log`）完成本地复验，全部通过（local pass）。
> GitHub Actions CI（.github/workflows/ci.yml，5 jobs）已全绿，见
> `docs/evidence/ci-status.md`。正常环境直接用上方 pnpm 脚本即可。

## 换人格

1. 新建 `config/persona/<name>.persona.json`（`spec: "chara_card_v3"`，字段见 `core/contract/persona.ts` 与 docs/def/pending-types.md）；
2. host 装配时 `createMockCognition({ persona: loadPersona(...) })`（人格经 Cognition 适配器注入，见 Q5 方案）；
3. 其他装配数据（renderers / parameters / tools）不变。**不改 core/contract/。**

```cmd
set GENESIS_PERSONA=config\persona\kaguya.persona.json
node node_modules\tsx\dist\cli.mjs main.ts
```

## 接真实 LLM（本地 Ollama / 在线 API 双模式，值级扩展）

- 适配器：`adapters/llm/openai-compatible-cognition.ts`（人格卡 system + 记忆 + 标记行格式解析）
- **对话记忆（三级）**：
  - 短期轮次：`in-memory-history-store.ts`（JSONL 持久化，重启续上；提示词取最近 `CHAT_MAX_TURNS` 轮）
  - **长期记忆：`long-term-memory.ts`（每 `CHAT_SUMMARY_EVERY` 轮用 LLM 自动提炼事实入库，容量/TTL/显式遗忘）**
  - 组合注入：`chat-memory.ts`（一次 recall = 长期条目 + 最近轮次，经契约预留的 MemoryStore→recall 路径）
- 聊天入口：**双击 `chat.cmd`**，或 `node node_modules\tsx\dist\cli.mjs demo-chat.ts`

聊天中可用命令：`/记忆` 查看长期记忆；`/忘记 关键词` 显式遗忘（归档可回滚）；`/quit` 退出。
相关环境变量：`CHAT_MAX_TURNS`（短期轮数）、`CHAT_SUMMARY_EVERY`（提炼频率，0 关闭）、
`CHAT_MEMORY_MAX`（长期容量 50）、`CHAT_MEMORY_TTL_DAYS`（遗忘天数 30）、`CHAT_HISTORY_DIR`（记忆目录）。

**本地模式（默认，无需任何配置）：**

```cmd
ollama pull qwen2.5:7b          # 首次需下载模型（约 4.7GB）
chat.cmd                        # 默认 Kaguya 人格；chat.cmd example 用示例人格
```

**在线模式（设置 LLM_API_KEY 后自动切换）：**

```cmd
set LLM_BASE_URL=https://api.deepseek.com
set LLM_MODEL=deepseek-chat
set LLM_API_KEY=sk-你的key
chat.cmd
```

其他环境变量：`GENESIS_PERSONA` 换人格卡；`OLLAMA_MODEL`/`OLLAMA_BASE_URL` 调本地配置；`CHAT_MAX_TURNS` 调记忆轮数。
`demo-chat.ts` 同时导出可复用接口 `createChatRuntime / sendUserMessage / runChatLoop`（接 Web/IM 宿主用）。
终端里输入任意中文对话，角色以人格卡设定 + 多轮记忆 + LLM 生成回复，走完整
校验→聚合→仲裁→渲染→feedback 链路。适配器是「值级」改动：不触碰 core/contract/。

> 全系统「查什么看哪里」索引见 [`docs/def/architecture.md`](docs/def/architecture.md)。

## 加 Renderer

实现 `core/contract/renderer.ts` 的 `Renderer`（capabilities.contractRanges 声明契约范围；`consumesFrames:true` 的还要过 L4.registerFrameCapability 两次校验并落表），放进 `adapters/renderers/`，加入 `RuntimeConfig.renderers`。mount 顺序 await、失败反序清理由装配链保证。

## 接 sharedBus（多 Runtime / 多角色）

```ts
const shared = createEventBus();
const a = await compose({ runtimeId: "rt:a", personaId: "p:a", sharedBus: shared, ... });
const b = await compose({ runtimeId: "rt:b", personaId: "p:b", sharedBus: shared, ... });
// world 广播全员接收；targetRuntimeId 定向只目标接收；runtime 事件仅同 runtimeId 接收
```

## 跑验收（A01a–A17）

证据矩阵见手册第 8 章（整理版 v1.0.0-rc.5-r1）。当前所有条目初始状态 **pending / 待 CI**；
本地跑过的产物写 **local pass**，**不宣称 CI 绿**。阻断项/观察项划分与投用门禁以手册 8.3–8.5 为准。
