# 交接静态说明（gen-handover.ts 会把本文件并入 docs/HANDOVER.md）

## 项目一句话

Genesis-1 角色运行时骨架（契约候选 v1.0.0-rc.5）：骨架定「今天长什么样」，插槽定「明天能长什么」，
判定表定「哪些明天不该长进来」。已叠加真实 LLM 对话（本地 Ollama / 在线 DeepSeek 双模式）、
三级对话记忆（短期轮次 / 长期提炼 / 遗忘机制）、一键聊天入口。

## 权威与状态

- 契约权威：附件 A《Genesis-1 角色运行时骨架手册（整理版）v1.0.0-rc.5-r1》；冻结决策 G/S/P0/P1/R/E 不重设计。
- 验收：A01a–A17 本地（verify.cmd 9 步全绿）+ GitHub Actions CI 全绿（见 docs/evidence/ci-status.md）。
- 状态口径：内部受控测试候选；**不是 v1.0.0**；不承诺生产安全/跨进程总线/真实适配器行为。
- 改动纪律：core/ 不 import adapters/、layers/；新能力只加 adapters/ 或四插槽；动 core/contract/ 必升版本 + 幂等 migrator。

## 本机环境注意事项（换机器/新环境必读）

1. 依赖：本机 pnpm 网络栈直连 npm 仓库报 WSAEACCES(10013)（Hyper-V 端口保留区重叠），
   改用 `npm install --registry=https://registry.npmjs.org`；正常环境用 pnpm 脚本即可。
2. 系统改动（曾做）：TCP 动态端口池改到 57060–65499，还原命令
   `netsh int ipv4 set dynamicport tcp start=49152 num=16384`。
3. 本地 LLM：Ollama 已装 qwen2.5:7b（4.7GB）与 qwen3:8b（5.2GB，默认）；`ollama pull <model>` 增装。
4. 在线 LLM：`llm-config.cmd`（已被 git 忽略）保存 key，模板见 `llm-config.example.cmd`；
   环境变量优先级：LLM_API_KEY 存在即在线（LLM_BASE_URL/LLM_MODEL），否则本地（OLLAMA_*）。
5. 聊天数据：`data/chat-history/`（每角色一个 .jsonl + .longterm.jsonl），已被 git 忽略。
6. 一键入口：`chat.cmd`（聊天）、`verify.cmd`（本地 10 步复验，含刷新 HANDOVER.md）。
7. 人工配置：人格/世界观/任务/对话偏向/模型/记忆参数全部入口见 `docs/def/manual-config-guide.md`；
   新增可配项：CHAT_WORLD_RULES（规则文件）、CHAT_EXTRA_SYSTEM（追加规则）、CHAT_TEMPERATURE。

## 下一步候选（按推荐顺序，均待拍板）

1. TTS 接真实语音（形状级：需动 feedback 契约，先三档判定评审）；
2. Live2D / VRChat OSC（形状级，同上）；
3. Web 聊天宿主（复用 demo-chat 导出的 createChatRuntime/sendUserMessage，值级）；
4. 多角色共存 demo（sharedBus 已预留，值级可先跑）；
5. 长期记忆向量化（把 long-term-memory 换成 embedding 检索，值级）；
6. 工具自动执行回路（CognitionOutput.tool_call → ToolRegistry.invoke 自动接线，形状级）；
7. 待确认类型清单（docs/def/pending-types.md，21 项）逐项拍板。

## 新会话交接检查清单（接手第一件事）

1. 读本文件（docs/HANDOVER.md）→ 读 docs/def/architecture.md（查询索引）；
2. `npm install`（本机）或 `pnpm install`（正常环境）；
3. `verify.cmd` 确认 9 步全绿；CI 状态看 docs/evidence/ci-status.md；
4. `chat.cmd` 跑通一条对话（本地或在线）；
5. 改动前查 docs/def/deviations.md 与 pending-types.md，避免踩已记录的坑；
6. 每次大改动后跑 `pnpm handover` 刷新本文件并提交。
