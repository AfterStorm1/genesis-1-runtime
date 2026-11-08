# callgraph-report.md (A02 静态面)

- 生成时间：2026-11-08T14:32:37.688Z
- 状态：local pass（静态面）；CI：pending / 待 CI

## L35.emitFrame 出现位置
- composition/composition-root.ts:248（via sampledValidator）
- 结论：composition 内 SampledValidator 间接调用 1 处；scheduler-impl 内 validateAt 调用 0 处（期望 0）。

## dispatchFrame / applyFrame 路径
- 违规文件：core/dispatch/signal-dispatcher-impl.ts

## 每入口调用点
### L3.aggregate.output
- core/pipeline.ts:216（via validateAt）
### Aggregator.aggregate
- core/pipeline.ts:204（via validateAt）
### L3.dispatch
- core/pipeline.ts:217（via validateAt）
### L35.emitFrame
- composition/composition-root.ts:248（via sampledValidator）
### Scheduler.submit
- core/scheduler/scheduler-impl.ts:65（via validateAt）
### Scheduler.submitExpression
- core/scheduler/scheduler-impl.ts:69（via validateAt）
### L4.publishFeedback
- composition/composition-root.ts:215（via validateAt）
### InputBus.snapshot
- core/input-bus/input-bus-impl.ts:44（via validateAt）
### InputBus.onDelta
- core/input-bus/input-bus-impl.ts:21（via validateAt）
### ToolRegistry.invoke
- core/tool/tool-registry-impl.ts:35（via validateAt）
### Cognition.onInput
- core/pipeline.ts:224（via validateAt）
### Cognition.onInput.output
- core/pipeline.ts:136（via validateAt）
- core/pipeline.ts:236（via validateAt）
### ExpressionSource.emit
- core/source-hub/hub-impl.ts:28（via validateAt）
### L4.register
- composition/composition-root.ts:134（via validateAt）
### L4.registerFrameCapability
- composition/composition-root.ts:163（via validateAt）
### L4.registerFrameCapability.ranges
- composition/composition-root.ts:164（via validateAt）
### L35.attachTrackingSource
- core/scheduler/scheduler-impl.ts:51（via validateAt）
### ToolRegistry.register
- core/tool/tool-registry-impl.ts:19（via validateAt）
### ParameterRegistry.register
- composition/composition-root.ts:110（via validateAt）
### PipelineHook.register
- composition/composition-root.ts:181（via validateAt）
### ExpressionSource.register
- core/source-hub/hub-impl.ts:15（via validateAt）
### CapabilityLedger.register
- core/component/capability-ledger-impl.ts:19（via validateAt）
