// Genesis-1 角色运行时骨架 · 契约
// minimal per handbook; confirm —— 手册未给 MemoryStore / RecallResult 正文；
// 最小字段仅支撑 recall 超时（memoryRecallTimeoutMs 默认 50ms）与 e2e 空记忆路径。
import type { CognitionInput } from "./cognition";

export interface RecallResult {
  items: Array<{ role?: string; content: string; ts?: number }>;
}

export interface MemoryStore {
  recall(query: { input: CognitionInput; limit?: number }): Promise<RecallResult | undefined>;
  save?(event: unknown): Promise<void>;
}
