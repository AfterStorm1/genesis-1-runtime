# docs/def 说明

本目录存放交付定义类文档：

- `features.md` —— **功能清单矩阵（唯一权威）**：功能/状态/档位/实现位置/开关的一张矩阵表。新增功能只更新本矩阵，其他文档只引用。
- `deviations.md` —— 与附件 A《Genesis-1 角色运行时骨架手册（整理版）v1.0.0-rc.5-r1》不一致处的偏差清单（值级扩展的行为细节见 D-xx）。
- `pending-types.md` —— 手册未给全字段的支撑类型清单（最小实现 + 待确认）。
- `architecture.md` —— 架构总览与「查什么看哪里」查询索引（扩展配方 + 铁律）。
- `manual-config-guide.md` —— 人工配置总指南（人格/世界观/模型/参数/命令）。
- `handover-notes.md` —— 交接静态说明（`gen-handover.ts` 把它并入 `docs/HANDOVER.md`）。

权威顺序：附件 A 手册全文 > 实现任务书 > 工程偏好。冲突已停点确认的，在偏差清单记录结论。

职责边界（各文档只负责一件事，其余只引用不复制）：`features.md`=功能清单（what+状态）｜`deviations.md`=行为细节/偏差（why+D-xx）｜`pending-types.md`=待确认类型｜`architecture.md`=扩展方法/查询索引｜`manual-config-guide.md`=配置参数｜`handover-notes.md`=本机环境+交接检查。
