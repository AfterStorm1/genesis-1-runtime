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
> `docs/evidence/verify.log`）完成本地复验，全部通过（local pass，CI 状态仍 pending）。
> 正常环境直接用上方 pnpm 脚本即可，CI 模板见 `.github/workflows/ci.yml`。

## 换人格

1. 新建 `config/persona/<name>.persona.json`（`spec: "chara_card_v3"`，字段见 `core/contract/persona.ts` 与 docs/def/pending-types.md）；
2. host 装配时 `createMockCognition({ persona: loadPersona(...) })`（人格经 Cognition 适配器注入，见 Q5 方案）；
3. 其他装配数据（renderers / parameters / tools）不变。**不改 core/contract/。**

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
