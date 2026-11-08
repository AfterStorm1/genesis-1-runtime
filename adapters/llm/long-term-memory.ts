// Genesis-1 · 长期记忆库（带遗忘机制，值级）
// 设计原则：
//   1. 容量上限（maxEntries，默认 50）：超限时按「重要度 × 时间衰减」评分淘汰最低者；
//   2. 时间衰减 + TTL（ttlDays，默认 30）：久未被提起且重要度低（≤2）的条目自动归档；
//   3. 显式遗忘 forget()：按关键词匹配归档；被「用得多」的条目 lastRecalledAt 前移（复习加固）；
//   4. 淘汰/遗忘一律「归档」而非物理删除——文件里保留 archived 标记，可解释、可回滚。
// 持久化：JSONL，每行一条 MemoryEntry；每次变更整文件重写（库很小）。
import fs from "node:fs";
import path from "node:path";

export interface LongTermMemoryOptions {
  /** 持久化文件（JSONL） */
  filePath: string;
  /** 活跃条目上限，默认 50 */
  maxEntries?: number;
  /** 久未使用且不重要条目的归档天数，默认 30；0 = 禁用 TTL */
  ttlDays?: number;
}

export interface MemoryEntry {
  id: string;
  text: string;
  /** 1（可有可无）~5（至关重要），默认 3 */
  importance: number;
  createdAt: number;
  lastRecalledAt: number;
  archived?: boolean;
}

export interface LongTermMemory {
  add(text: string, importance?: number): void;
  /** 供提示词注入：活跃条目按评分取前 limit 条（默认 10），并复习加固 */
  promptItems(limit?: number): Array<{ text: string }>;
  /** 显式遗忘：文本包含 fragment 的活跃条目归档；返回归档数 */
  forget(fragment: string): number;
  /** 全量快照（含归档，调试/回滚用） */
  list(): MemoryEntry[];
  /** 手动触发一次淘汰（加载时也会自动跑一次） */
  prune(): number;
  /** 恢复最近一次 forget 归档的条目（简单回滚） */
  restoreArchived(maxAgeMs?: number): number;
}

function isEntry(x: unknown): x is MemoryEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.text === "string";
}

function daysBetween(a: number, b: number): number {
  return (a - b) / 86_400_000;
}

export function createLongTermMemory(opts: LongTermMemoryOptions): LongTermMemory {
  const maxEntries = opts.maxEntries ?? 50;
  const ttlDays = opts.ttlDays ?? 30;
  const entries: MemoryEntry[] = [];
  let seq = 0;

  function persist(): void {
    try {
      fs.mkdirSync(path.dirname(opts.filePath), { recursive: true });
      fs.writeFileSync(
        opts.filePath,
        entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : ""),
        "utf8",
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[long-term-memory] persist failed", err);
    }
  }

  // 启动恢复
  try {
    const text = fs.readFileSync(opts.filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      try {
        const obj = JSON.parse(line) as unknown;
        if (isEntry(obj)) entries.push(obj);
      } catch {
        /* 跳过坏行 */
      }
    }
    for (const e of entries) {
      if (e.archived !== true) e.archived = false;
      e.importance = Math.min(5, Math.max(1, Number(e.importance) || 3));
      if (typeof e.createdAt !== "number") e.createdAt = Date.now();
      if (typeof e.lastRecalledAt !== "number") e.lastRecalledAt = e.createdAt;
    }
  } catch {
    /* 文件不存在 */
  }

  function score(e: MemoryEntry, now: number): number {
    const ageDays = Math.max(0, daysBetween(now, e.lastRecalledAt));
    const decay = ttlDays <= 0 ? 1 : Math.max(0, 1 - ageDays / ttlDays);
    return e.importance * (0.5 + 0.5 * decay); // 重要度打底 50%，时间衰减影响另一半
  }

  function prune(): number {
    const now = Date.now();
    let archived = 0;
    // TTL：久未使用（>ttlDays）且重要度 ≤2 → 归档
    if (ttlDays > 0) {
      for (const e of entries) {
        if (e.archived === true) continue;
        if (e.importance <= 2 && daysBetween(now, e.lastRecalledAt) > ttlDays) {
          e.archived = true;
          archived += 1;
        }
      }
    }
    // 容量：活跃超限时按评分淘汰最低者
    const active = entries.filter((e) => e.archived !== true);
    while (active.length > maxEntries) {
      let worst: MemoryEntry | undefined;
      let worstScore = Number.POSITIVE_INFINITY;
      for (const e of active) {
        const s = score(e, now);
        if (s < worstScore) {
          worstScore = s;
          worst = e;
        }
      }
      if (worst === undefined) break;
      worst.archived = true;
      archived += 1;
      active.splice(active.indexOf(worst), 1);
    }
    if (archived > 0) persist();
    return archived;
  }

  return {
    add(text, importance = 3) {
      const t = text.trim();
      if (t === "") return;
      const now = Date.now();
      seq += 1;
      entries.push({
        id: `m-${now}-${seq}`,
        text: t,
        importance: Math.min(5, Math.max(1, Number(importance) || 3)),
        createdAt: now,
        lastRecalledAt: now,
      });
      prune();
      persist();
    },
    promptItems(limit = 10) {
      prune();
      const now = Date.now();
      const active = entries.filter((e) => e.archived !== true);
      active.sort((a, b) => score(b, now) - score(a, now));
      const picked = active.slice(0, limit);
      for (const e of picked) e.lastRecalledAt = now; // 复习加固
      persist();
      return picked.map((e) => ({ text: e.text }));
    },
    forget(fragment) {
      const f = fragment.trim();
      if (f === "") return 0;
      let n = 0;
      for (const e of entries) {
        if (e.archived !== true && e.text.includes(f)) {
          e.archived = true;
          n += 1;
        }
      }
      if (n > 0) persist();
      return n;
    },
    list() {
      return entries.map((e) => ({ ...e }));
    },
    prune,
    restoreArchived(maxAgeMs = 24 * 3600_000) {
      const cutoff = Date.now() - maxAgeMs;
      let n = 0;
      for (const e of entries) {
        if (e.archived === true && e.lastRecalledAt >= cutoff) {
          e.archived = false;
          n += 1;
        }
      }
      if (n > 0) persist();
      prune();
      return n;
    },
  };
}
