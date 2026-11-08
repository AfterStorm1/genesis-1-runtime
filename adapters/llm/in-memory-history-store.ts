// Genesis-1 · 滚动内存历史（MemoryStore 最小实现之一，值级）
// 功能：保存最近 N 轮对话；pipeline 的 recall（默认 50ms 超时内返回）
// 把历史放进 CognitionInput.recall，LLM 适配器据此注入多轮上下文。
// 通过 RuntimeConfig.memory 注入，不动契约。
import type { MemoryStore, RecallResult } from "../../core/contract/memory";
import type { CognitionInput } from "../../core/contract/cognition";

export interface InMemoryHistoryStoreOptions {
  /** 保留最近多少「轮」（一问一答 = 1 轮 = 2 条），默认 10 */
  maxTurns?: number;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface InMemoryHistoryStore extends MemoryStore {
  /** 必选化（MemoryStore 中 save 为可选） */
  save(event: unknown): Promise<void>;
  /** 宿主追加一条（save 的类型化便利版） */
  saveTurn(role: HistoryItem["role"], content: string): void;
  /** 只读快照（测试/调试） */
  list(): HistoryItem[];
  clear(): void;
}

export function createInMemoryHistoryStore(opts?: InMemoryHistoryStoreOptions): InMemoryHistoryStore {
  const maxTurns = opts?.maxTurns ?? 10;
  const items: HistoryItem[] = [];

  function append(role: HistoryItem["role"], content: string): void {
    if (content.trim() === "") return;
    items.push({ role, content, ts: Date.now() });
    const maxItems = maxTurns * 2;
    while (items.length > maxItems) items.shift();
  }

  return {
    async recall(query: { input: CognitionInput; limit?: number }): Promise<RecallResult | undefined> {
      void query.input; // 滚动历史不依赖输入内容，只按时间取最近
      const limit = query.limit ?? maxTurns * 2;
      const tail = items.slice(-limit);
      if (tail.length === 0) return undefined;
      return { items: tail.map((i) => ({ role: i.role, content: i.content, ts: i.ts })) };
    },
    async save(event: unknown): Promise<void> {
      const e = event as { role?: unknown; content?: unknown };
      if (typeof e?.content === "string" && (e.role === "user" || e.role === "assistant")) {
        append(e.role, e.content);
      }
    },
    saveTurn(role, content) {
      append(role, content);
    },
    list() {
      return [...items];
    },
    clear() {
      items.length = 0;
    },
  };
}
