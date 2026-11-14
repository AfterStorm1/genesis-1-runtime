# 人工配置总指南（所有需要你手动设置的地方）

> 一句话：**人格写 JSON，世界观写 md，规则用环境变量，模型用配置文件。**
> 全部配置都是「值级」——改它们不需要懂代码，也不需要改 core/contract/。

## 0. 配置全景图（优先级：环境变量 > 配置文件 > 代码默认值）

```
config/persona/<名字>.persona.json   人格卡（人设/性格/场景/开场白/对话示范）← 最核心
config/world/rules.example.md        世界观/任务/对话偏向规则文件模板
llm-config.cmd                       在线 API key + 模型（不入 git，仅本机）
data/chat-history/                   记忆文件（自动生成，勿手改）
──────────────────────────────────────────────
环境变量（终端 set 或写进 llm-config.cmd）：
  GENESIS_PERSONA      人格卡路径        CHAT_WORLD_RULES   规则文件路径
  CHAT_EXTRA_SYSTEM    追加系统规则      CHAT_TEMPERATURE   采样温度
  LLM_API_KEY/LLM_BASE_URL/LLM_MODEL    在线模式三件套
  OLLAMA_MODEL/OLLAMA_BASE_URL          本地模式
  CHAT_MAX_TURNS / CHAT_SUMMARY_EVERY / CHAT_MEMORY_MAX / CHAT_MEMORY_TTL_DAYS / CHAT_HISTORY_DIR
```

## 1. 人格卡（config/persona/*.json）—— 人设的唯一权威

字段逐个说明与写法：

| 字段 | 写什么 | 写法示例 |
|---|---|---|
| `name` | 角色名（决定记忆文件名，建议 ASCII） | `"skeleton"` |
| `description` | 身份与来历（世界观里「她是谁」） | `"占位：身份与来历"` |
| `personality` | **说话风格**：长短句、口头禅、喜恶、脾气 | `"占位：寡言、句句有分量"` |
| `scenario` | 当前场景与你和她的关系 | `"占位：场景与关系"` |
| `first_mes` | 开场白（定调） | `"占位：第一句话"` |
| `mes_example` | **对话示范**（1~2 条一问一答，小模型照猫画虎，效果最大） | `"用户：在吗\n角色：在。"` |
| `tags` | 分类标签（暂不参与逻辑） | `["skeleton","todo"]` |
| `extensions` | 预留扩展（世界书等，暂未实现） | `{}` |

**用法**：复制 `example.persona.json` → 改名 → 编辑 → `set GENESIS_PERSONA=config\persona\xxx.json` → `chat.cmd`。
**换人格 = 换这个文件**，其它什么都不用动。

## 2. 世界观 / 任务 / 对话偏向 —— 三个注入口

按「从稳定到临时」排序：

| 注入口 | 适合写什么 | 怎么设置 |
|---|---|---|
| ① 人格卡 `scenario`+`description` | 与角色强绑定的世界观与关系 | 改 JSON |
| ② **规则文件**（推荐） | 世界观事实、任务目标、风格硬规则、红线 | 参考 `config/world/rules.example.md`，改好后 `set CHAT_WORLD_RULES=你的文件路径` |
| ③ 环境变量文本 | 临时追加一条规则 | `set CHAT_EXTRA_SYSTEM=今天你心情很好` |

注入顺序（后写的优先级高）：人格卡 → CHAT_WORLD_RULES 文件 → CHAT_EXTRA_SYSTEM。
**任务（mission）目前是静态文本**（写进规则文件的「任务」节）；动态任务系统（可推进/完成的）属于后续形状级工作，接口预留中。

## 3. 模型与 API（llm-config.cmd，不入 git）

复制 `llm-config.example.cmd` → `llm-config.cmd`，填：

```bat
rem 在线模式（填了 key 即自动在线）
set "LLM_API_KEY=sk-你的key"
set "LLM_BASE_URL=https://api.deepseek.com"
set "LLM_MODEL=deepseek-chat"
rem 本地模式（key 留空时生效）
rem set "OLLAMA_MODEL=qwen3:8b"
rem set "OLLAMA_BASE_URL=http://localhost:11434"
rem 固定人格与规则（可选）
rem set "GENESIS_PERSONA=config\persona\skeleton.persona.json"
rem set "CHAT_WORLD_RULES=config\world\rules.skeleton.md"
```

- key 为空 → 自动用本地 Ollama（`ollama pull <模型名>` 增装新模型）；
- 本地模型列表：`ollama list`；推荐 qwen3:8b（质量）或 qwen2.5:7b（速度）。

## 4. 对话行为参数（环境变量，可写进 llm-config.cmd）

| 变量 | 默认 | 作用 |
|---|---|---|
| `CHAT_TEMPERATURE` | 0.7 | 采样温度：0.4 稳重官方，0.7 平衡，1.0 跳脱 |
| `CHAT_MAX_TURNS` | 10 | 短期逐字历史进提示词的轮数 |
| `CHAT_SUMMARY_EVERY` | 4 | 每 N 个用户回合自动提炼长期记忆（0=关） |
| `CHAT_MEMORY_MAX` | 50 | 长期记忆容量（超限按重要度淘汰） |
| `CHAT_MEMORY_TTL_DAYS` | 30 | 久未提起且不重要的记忆自动遗忘天数 |
| `CHAT_HISTORY_DIR` | data/chat-history | 记忆文件目录 |

## 5. 聊天内命令

| 命令 | 作用 |
|---|---|
| `/记忆` | 查看长期记忆（带重要度） |
| `/忘记 关键词` | 显式遗忘（归档可回滚） |
| `/quit` | 退出（历史与长期记忆自动保存） |

## 6. 日常操作速查

```cmd
chat.cmd                             双击/运行即聊天
chat.cmd example                     临时用 example 人格
ollama list                          看本地模型    ollama pull qwen3:8b  增装
verify.cmd                           本地 10 步复验（含刷新 HANDOVER.md）
git push                             推送（CI 自动验证）
```

## 7. 常见问题

- **说话风格不对** → 改 `personality` 和 `mes_example`（后者最有效）；
- **世界观乱了** → 把设定写进 CHAT_WORLD_RULES 文件（比塞 description 更清晰）；
- **太跳/太呆** → 调 `CHAT_TEMPERATURE`（低=稳，高=活）；
- **忘了约定** → 提高 `CHAT_MAX_TURNS` 或让它在每 4 轮提炼时记住（`/记忆` 可查）；
- **要它彻底忘掉** → `/忘记 关键词`；
- **想换模型** → 改 llm-config.cmd 的 `LLM_MODEL` / `OLLAMA_MODEL`。
