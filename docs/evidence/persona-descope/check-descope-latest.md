# 蕙 · 去工作场景依赖 验收报告

- 时间：2026-11-10T10:52:29.365Z（北京时间 2026/11/10 18:52:29）
- 结论：**通过**

| 检查 | 结果 | 详情 |
|---|---|---|
| V3-rules-scoping | PASS | 「可选场景」节存在；工作场景词仅出现在该节内 |
| V2-example-ratio | PASS | 示例行 11 条：非工作 11 / 工作 0，非工作占比 100%（要求 ≥50%） |
| meta-directive | PASS | 「场景框架」元指令在规则文件顶部（注入顺序在人格卡之后） |
| V1-three-questions | PASS | 3/3 通过（生活关键词命中 且 无工作拉回词） |
| V1-detail | PASS | <br>/ 样本 / 结果 / 问题 / 实际回复 /<br>/---/---/---/---/<br>/ offwork-1 / ✅ / 你下班之后一般做什么 / [EMOTION] calm / 做饭，看会儿书。有时候去河边走 /<br>/ offwork-2 / ✅ / 周末有空吗 / [EMOTION] calm / 有。怎么了 /<br>/ offwork-3 / ✅ / 你喜欢什么 / [EMOTION] calm / 做饭。还有旧东西，修好了会高兴 / |
| V4-regression | WARN | 全样本反应回归由 weekly-check.cmd 执行（含原有 11 条工作样本 + 3 条生活样本），见 docs/evidence/weekly-check-latest.md |

> 由 scripts/check-descope.ts 生成；V4 回归结果以 weekly-check 报告为准。
