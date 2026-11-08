# 待确认类型清单

任务书 §5 授权：手册未给全字段的支撑类型补最小必要类型，标注 `// minimal per handbook; confirm`，列入本清单；不改变已冻结入口语义。

| 类型 | 位置 | 最小字段 | 备注 |
| --- | --- | --- | --- |
| PersonaCardV3 | core/contract/persona.ts | `spec: "chara_card_v3"; data:{name,...}`（ST V3 最小结构，D5） | 人格切换只换 config/persona/ |
| MemoryStore | core/contract/memory.ts | `recall(query): Promise<RecallResult \| undefined>; save?()` | 超时由 pipeline 兜底（默认 50ms）；参考最小实现：`adapters/llm/in-memory-history-store.ts`（滚动 N 轮） |
| RecallResult | core/contract/memory.ts | `items: Array<{role?; content; ts?}>` | |
| CognitionContext | core/contract/cognition.ts | `{ contractVersion; clock; logger }` | persona 经适配器注入（Q5），不在 ctx |
| WorldSnapshot | core/contract/perception.ts | `{ contractVersion; ts; entities }` | |
| WorldDelta | core/contract/perception.ts | `{ contractVersion; kind: user_message\|perception\|world_entity; text?; snapshot?; entity?; ts? }` | |
| WorldEntity | core/contract/perception.ts | `{ id; kind?; position?; data? }` | |
| Logger | core/contract/pipeline-hook.ts | `{ debug?; info; warn; error }` | |
| ToolHandler | core/contract/tool.ts | `(args, principal) => unknown \| Promise<unknown>` | |
| ContractMigratorEntry | core/contract/versioning.ts | `{ from; to; migrate(old) }` | |
| JSONSchema | core/contract/tool.ts | `type/properties/required/items` 最小子集 | 默认校验器同样最小 |
| InputBus | core/contract/input-bus.ts | `inject / injectSnapshot / snapshot / onDelta / dispose` | 由附录 C 反推 |
| SignalDispatcher | core/contract/dispatch.ts | `dispatch / dispatchFrame / dispose` | 由路由规则反推 |
| RendererRegistry | core/contract/dispatch.ts | `register / registerFrameCapability / list / dispose` | 由 G-03 / P1-R6 反推 |
| FeedbackChannel | core/contract/feedback.ts | `publish / subscribe / dispose` | 由 RendererContext.feedback 反推 |
| SpeechSessionStore.onRelease reason→state 映射 | core/speech/speech-session-store-impl.ts | completed/feedback_done→done；feedback_error→failed；其余→interrupted | 手册只写死 feedback 映射表（D-10） |
| 默认仲裁策略行为 | layers/l3-arbiter/strategy-default.ts | channelOf=speech/motion；高优先级+可中断才打断 | 手册未给默认行为（D-11） |
| 默认 FusionStage / SpatialIntent 运动学 | layers/l35-scheduler/fusion-default.ts | 无行为；axes 恒 0 | 不实现真实体感（D-13） |
| 多 speech 输出 | layers/l3-expression/aggregator-default.ts | 取首条、其余记 degraded | 手册规则未覆盖多 speech |
| 默认 emotion-only 信号 interruptible | aggregator-default | `interruptible: true` | 手册未指定 |
| worldBounds 空交集 | core/safety/merge.ts | 保持默认并记 adjusted | 手册未定义 |

> 以上待确认项均不改变已冻结入口语义；确认后如需变更，走契约升级流程（动 core/contract/ 并升版本）。
