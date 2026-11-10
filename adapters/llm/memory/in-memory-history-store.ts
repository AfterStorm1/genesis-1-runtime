// Genesis-1 · 滚动对话记忆（MemoryStore 最小实现之一，值级）
// 功能：
//   - 内存中保留最近 500 条历史（recall 默认返回最近 maxTurns*2 条供提示词使用，limit 可指定更多）
//   - 可选 filePath：JSONL 持久化——每次追加一行，重启后自动加载，对话不丢
// 通过 RuntimeConfig.memory 注入，不动契约。
import fs from "node:fs";
import path from "node:path";
import type { MemoryStore, RecallResult } from "../../../core/contract/memory";
import type { CognitionInput } from "../../../core/contract/cognition";

export interface InMemoryHistoryStoreOptions {
  /** 提示词默认取最近多少「轮」（一问一答 = 1 轮 = 2 条），默认 10 */
  maxTurns?: number;
  /** 持久化文件路径（JSONL，每行一条 {role,content,ts}）；缺省仅内存 */
  filePath?: string;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

/** 内存中最多保留的条数（防止超大文件拖垮内存；提示词只会取最近 maxTurns*2 条） */
const MAX_IN_MEMORY = 500;

export interface InMemoryHistoryStore extends MemoryStore {
  /** 必选化（MemoryStore 中 save 为可选） */
  save(event: unknown): Promise<void>;
  /** 宿主追加一条（save 的类型化便利版） */
  saveTurn(role: HistoryItem["role"], content: string): void;
  /** 只读快照（测试/调试） */
  list(): HistoryItem[];
  clear(): void;
}

function isValidItem(x: unknown): x is HistoryItem {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.content === "string" &&
    (o.role === "user" || o.role === "assistant") &&
    (typeof o.ts === "number" || o.ts === undefined)
  );
}

export function createInMemoryHistoryStore(opts?: InMemoryHistoryStoreOptions): InMemoryHistoryStore {
  const maxTurns = opts?.maxTurns ?? 10;
  const filePath = opts?.filePath;
  const items: HistoryItem[] = [];

  // 启动时从磁盘恢复历史（文件不存在/损坏 → 空历史）
  if (filePath !== undefined) {
    try {
      const text = fs.readFileSync(filePath, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() === "") continue;
        try {
          const obj = JSON.parse(line) as unknown;
          if (isValidItem(obj)) {
            items.push({ role: obj.role, content: obj.content, ts: obj.ts ?? Date.now() });
          }
        } catch {
          /* 跳过坏行 */
        }
      }
    } catch {
      /* 文件不存在 */
    }
    while (items.length > MAX_IN_MEMORY) items.shift();
  }

  function append(role: HistoryItem["role"], content: string): void {
    if (content.trim() === "") return;
    const item: HistoryItem = { role, content, ts: Date.now() };
    items.push(item);
    while (items.length > MAX_IN_MEMORY) items.shift();
    if (filePath !== undefined) {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.appendFileSync(filePath, JSON.stringify(item) + "\n", "utf8");
      } catch (err) {
        // 持久化失败不影响会话（骨架行为：记日志由宿主决定）
        // eslint-disable-next-line no-console
        console.warn("[history-store] persist failed", err);
      }
    }
  }

  return {
    async recall(query: { input: CognitionInput; limit?: number }): Promise<RecallResult | undefined> {
      void query.input; // 历史按时间取最近，不依赖输入内容
      const limit = query.limit ?? maxTurns * 2;
      const tail = items.slice(-limit);
      if (tail.length === 0) return undefined;
      return { items: tail.map((i) => ({ role: i.role, content: i.content, ts: i.ts })) };
    },
    async save(event: unknown): Promise<void> {
      if (isValidItem(event)) append(event.role, event.content);
    },
    saveTurn(role, content) {
      append(role, content);
    },
    list() {
      return [...items];
    },
    clear() {
      items.length = 0;
      if (filePath !== undefined) {
        try {
          fs.writeFileSync(filePath, "", "utf8");
        } catch {
          /* 忽略 */
        }
      }
    },
  };
}
