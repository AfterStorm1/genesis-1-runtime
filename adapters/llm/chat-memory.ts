// Genesis-1 · 组合记忆（短期轮次 + 长期记忆库），作为单个 MemoryStore 注入 RuntimeConfig.memory
// recall 返回：长期记忆条目（role="memory"，按评分排序）+ 最近轮次（user/assistant 按时间序）。
import type { MemoryStore, RecallResult } from "../../core/contract/memory";
import type { CognitionInput } from "../../core/contract/cognition";
import type { InMemoryHistoryStore } from "./in-memory-history-store";
import type { LongTermMemory } from "./long-term-memory";

export interface ChatMemoryOptions {
  turns: InMemoryHistoryStore;
  longTerm: LongTermMemory;
  /** 长期记忆注入提示词的最大条数，默认 10 */
  longTermLimit?: number;
  /** 短期轮次注入提示词的条数，默认 20（= 10 轮） */
  turnLimit?: number;
}

export interface ChatMemory extends MemoryStore {
  /** 必选化（MemoryStore 中 save 为可选）；转发给短期轮次存储 */
  save(event: unknown): Promise<void>;
  turns: InMemoryHistoryStore;
  longTerm: LongTermMemory;
}

export function createChatMemory(opts: ChatMemoryOptions): ChatMemory {
  const longTermLimit = opts.longTermLimit ?? 10;
  const turnLimit = opts.turnLimit ?? 20;

  return {
    turns: opts.turns,
    longTerm: opts.longTerm,
    async recall(query: { input: CognitionInput; limit?: number }): Promise<RecallResult | undefined> {
      void query.input;
      const memoryItems = opts.longTerm.promptItems(longTermLimit).map((m) => ({
        role: "memory" as const,
        content: m.text,
      }));
      const turnRes = await opts.turns.recall({ input: query.input, limit: turnLimit });
      const turnItems = turnRes?.items ?? [];
      const items = [...memoryItems, ...turnItems];
      if (items.length === 0) return undefined;
      return { items };
    },
    async save(event: unknown): Promise<void> {
      // 对话轮次由宿主通过 turns.saveTurn 写入；save 转发给 turns（兼容契约）
      await opts.turns.save(event);
    },
  };
}
