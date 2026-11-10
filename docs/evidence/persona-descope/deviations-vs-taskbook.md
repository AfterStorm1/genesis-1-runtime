# 去工作场景依赖改造 · 与任务书的偏差清单

任务书假设了一套不存在的文件结构（worldbook.json / identity.facts / prompt-order.json / B1-B2 测试）。
本仓库按「目标等价映射」实施，全部改动仍为 config + prompt 组装级，未动 core 契约。

| # | 任务书条目 | 实际实施 | 偏差说明 |
|---|---|---|---|
| 1 | `config/persona/hui.worldbook.json` | `config/world/hui-rules.md`（既有注入链路，chat.cmd 默认加载） | 无 worldbook.json 文件；生活面区块（offWork：where/habits/relations 占位）已写入规则文件「生活面」节 |
| 2 | `identity.facts` 改写 | 人格卡 `description` 成因式改写 + `personality` 去场景措辞 + `scenario` 通用化 + `mes_example` 2 条非工作示例 | chara_card_v3 无 facts 字段；等价字段承载 |
| 3 | `behaviorRules` 去场景化 + 带新人降级 | 规则文件「日常行为准则」去场景化（被安排→被要求等）；带新人整段移入「可选场景（工作背景仅作为成因）」节 | 无 priority/optionalScenes 字段结构；按小节划分等价实现 |
| 4 | 新增 3–5 条非工作规则 + 非工作示例 | 新增「非工作场景」节（下班后做什么/兴趣爱好/被约/独处被搭话 4 条，5 示例）；日常行为准则每类补 1 条非工作示例 | 示例行格式沿用「- 示例：情境 → 反应」 |
| 5 | `prompt-order.json` + `prompt/render-sections.ts` 元指令 | 元指令写为规则文件顶部「场景框架」节（固定句）；注入顺序天然在人格卡之后（system = 人格卡 → 规则文件） | 无 prompt 渲染机制；不新建机制，复用既有注入链 |
| 6 | 记忆抽取生活类 + 不注入工作事件 | 规则文件「记忆规范」扩充生活类 remember/ignore 项（含「不主动把工作事件带进非工作对话」） | 提炼指令为 prompt 级；未扩展 MemoryStore 结构（更好的方法：指令级即可生效） |
| 7 | V1 三问测试 | 新增 3 条 offwork-* 反应样本 + `scripts/check-descope.ts` 双面判定（生活关键词命中 且 无工作拉回词） | 双面判定比任务书单面关键词更严 |
| 8 | V2 示例配比 ≥50% | check-descope 统计 rules 内示例行非工作占比（当前 100%） | 静态统计脚本 |
| 9 | V3 规则场景检查（≤2 且 edge/optional） | check-descope 校验：工作场景词只允许出现在「可选场景」节内 | 等价约束 |
| 10 | V4 B1/B2 回归 | 全样本反应回归委托 weekly-check（含原 11 条工作样本 + 3 条新生活样本） | 无 B1/B2 既有测试；以反应样本评测替代人格一致性回归 |
| 11 | 交付物 3：prompt-order.json diff | 无此文件；以规则文件 diff（git 记录）替代 | — |

未发现其他偏差。
