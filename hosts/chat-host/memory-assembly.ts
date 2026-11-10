// Genesis-1 · 聊天宿主：记忆体系组装（三级记忆一次装配成单个 MemoryStore）
import path from "node:path";
import {
  createChatMemory,
  createFeelingMemory,
  createInMemoryHistoryStore,
  createLongTermMemory,
} from "../../adapters/llm/memory";
import type { ChatMemory, FeelingMemory, InMemoryHistoryStore, LongTermMemory } from "../../adapters/llm/memory";

export interface MemoryAssemblyOptions {
  maxTurns?: number;
  memoryMax?: number;
  memoryTtlDays?: number;
}

export interface ChatMemoryAssembly {
  /** 短期轮次存储（逐字历史） */
  history: InMemoryHistoryStore;
  /** 长期事实库（带遗忘机制） */
  longTerm: LongTermMemory;
  /** 第一人称感受库（感受会随时间变淡） */
  feelings: FeelingMemory;
  /** 组合注入（pipeline 的 recall 一次返回感受+事实+轮次） */
  memory: ChatMemory;
  historyFile: string;
  longTermFile: string;
  feelingFile: string;
}

/** 按角色名组装三级记忆（每角色三个 JSONL 文件，重启自动续上） */
export function assembleChatMemory(
  personaName: string,
  historyDir: string,
  opts?: MemoryAssemblyOptions,
): ChatMemoryAssembly {
  const maxTurns = opts?.maxTurns ?? 10;
  const historyFile = path.join(historyDir, `${personaName}.jsonl`);
  const longTermFile = path.join(historyDir, `${personaName}.longterm.jsonl`);
  const feelingFile = path.join(historyDir, `${personaName}.feelings.jsonl`);

  const history = createInMemoryHistoryStore({ maxTurns, filePath: historyFile });
  const longTerm = createLongTermMemory({
    filePath: longTermFile,
    maxEntries: opts?.memoryMax ?? 50,
    ttlDays: opts?.memoryTtlDays ?? 30,
  });
  const feelings = createFeelingMemory({ filePath: feelingFile });
  const memory = createChatMemory({ turns: history, longTerm, feelings });

  return { history, longTerm, feelings, memory, historyFile, longTermFile, feelingFile };
}
