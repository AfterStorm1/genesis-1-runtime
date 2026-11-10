// Genesis-1 · 第一人称感受记忆库（值级）
// 与长期记忆（事实层）互补：只记「角色自己的感受」——
//   - 条目：第一人称文本 + 情绪词 + 强度(0..1)
//   - 感受会淡：强度按日衰减（intensityDecayPerDay），低过 0.1 自动归档
//   - 容量/TTL：默认 20 条 / 14 天（感受比事实更易逝）
//   - 遗忘=归档不删除（与事实层一致，可解释、可回滚）
// 持久化：JSONL，整文件重写（库很小）。
import fs from "node:fs";
import path from "node:path";

export interface FeelingMemoryOptions {
  filePath: string;
  maxEntries?: number;
  ttlDays?: number;
  /** 强度每日衰减比例（0~1），默认 0.05 */
  intensityDecayPerDay?: number;
  now?: () => number;
}

export interface FeelingEntry {
  id: string;
  /** 第一人称感受 */
  text: string;
  /** 情绪词：calm/happy/sad/angry/surprised/neutral */
  emotion: string;
  /** 0..1，随时间衰减 */
  intensity: number;
  createdAt: number;
  lastRecalledAt: number;
  archived?: boolean;
}

export interface FeelingMemory {
  add(text: string, emotion?: string, intensity?: number): void;
  /** 供提示词注入：活跃感受按「强度×新近」取前 limit 条，并衰减+复习 */
  promptItems(limit?: number): Array<{ text: string; emotion: string; intensity: number }>;
  list(): FeelingEntry[];
  /** 显式遗忘：文本包含 fragment 的感受归档；返回归档数 */
  forget(fragment: string): number;
  prune(): number;
}

const VALID_EMOTIONS = new Set(["calm", "happy", "sad", "angry", "surprised", "neutral"]);

function isEntry(x: unknown): x is FeelingEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.text === "string";
}

export function createFeelingMemory(opts: FeelingMemoryOptions): FeelingMemory {
  const maxEntries = opts.maxEntries ?? 20;
  const ttlDays = opts.ttlDays ?? 14;
  const decayPerDay = opts.intensityDecayPerDay ?? 0.05;
  const nowFn = opts.now ?? ((): number => Date.now());
  const entries: FeelingEntry[] = [];
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
      console.warn("[feeling-memory] persist failed", err);
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
      e.intensity = Math.min(1, Math.max(0, Number(e.intensity) || 0.6));
      if (!VALID_EMOTIONS.has(e.emotion)) e.emotion = "neutral";
      if (typeof e.createdAt !== "number") e.createdAt = nowFn();
      if (typeof e.lastRecalledAt !== "number") e.lastRecalledAt = e.createdAt;
    }
  } catch {
    /* 文件不存在 */
  }

  function prune(): number {
    const now = nowFn();
    let archived = 0;
    if (ttlDays > 0) {
      for (const e of entries) {
        if (e.archived === true) continue;
        if ((now - e.lastRecalledAt) / 86_400_000 > ttlDays) {
          e.archived = true;
          archived += 1;
        }
      }
    }
    const active = entries.filter((e) => e.archived !== true);
    active.sort((a, b) => b.intensity - a.intensity);
    while (active.length > maxEntries) {
      const weakest = active.pop();
      if (weakest === undefined) break;
      weakest.archived = true;
      archived += 1;
    }
    if (archived > 0) persist();
    return archived;
  }

  return {
    add(text, emotion = "neutral", intensity = 0.6) {
      const t = text.trim();
      if (t === "") return;
      const now = nowFn();
      seq += 1;
      entries.push({
        id: `f-${now}-${seq}`,
        text: t,
        emotion: VALID_EMOTIONS.has(emotion) ? emotion : "neutral",
        intensity: Math.min(1, Math.max(0, Number(intensity) || 0.6)),
        createdAt: now,
        lastRecalledAt: now,
      });
      prune();
      persist();
    },
    promptItems(limit = 5) {
      prune();
      const now = nowFn();
      const active = entries.filter((e) => e.archived !== true);
      for (const e of active) {
        // 感受会淡：按未使用天数衰减强度
        const days = Math.max(0, (now - e.lastRecalledAt) / 86_400_000);
        e.intensity = Math.max(0, e.intensity * (1 - decayPerDay * days));
        if (e.intensity < 0.1) {
          e.archived = true; // 淡到几乎没了 → 归档
        }
      }
      const alive = active.filter((e) => e.archived !== true);
      alive.sort((a, b) => b.intensity - a.intensity || b.lastRecalledAt - a.lastRecalledAt);
      const picked = alive.slice(0, limit);
      for (const e of picked) e.lastRecalledAt = now; // 复习加固
      persist();
      return picked.map((e) => ({ text: e.text, emotion: e.emotion, intensity: e.intensity }));
    },
    list() {
      return entries.map((e) => ({ ...e }));
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
    prune,
  };
}
