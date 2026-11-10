// 第一人称感受记忆：添加/衰减归档/注入/遗忘/持久化（值级扩展测试）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFeelingMemory } from "../../adapters/llm/feeling-memory";
import { writeEvidenceLog } from "../helpers/evidence";

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "genesis-feel-")), "f.jsonl");
}

describe("feeling memory", () => {
  it("add / promptItems：感受注入带情绪词；非法情绪词归 neutral", () => {
    const m = createFeelingMemory({ filePath: tmpFile() });
    m.add("一起修书的时候很安静，我有点喜欢", "calm", 0.8);
    m.add("他说的话让我有点烦", "haha", 0.6); // 非法情绪词
    const items = m.promptItems(5);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ emotion: "calm", text: "一起修书的时候很安静，我有点喜欢" });
    expect(items.map((i) => i.emotion).sort()).toEqual(["calm", "neutral"]);
  });

  it("感受会淡：强度逐日衰减，低于 0.1 自动归档", () => {
    let t = 0;
    const m = createFeelingMemory({ filePath: tmpFile(), now: () => t, intensityDecayPerDay: 0.05 });
    m.add("有点开心", "happy", 0.5);
    t += 200 * 86_400_000; // 200 天未用
    expect(m.promptItems(5)).toHaveLength(0); // 淡没了 → 归档
    expect(m.list().filter((e) => e.archived !== true)).toHaveLength(0);
  });

  it("TTL：超过 14 天未想起 → 归档", () => {
    let t = 0;
    const m = createFeelingMemory({ filePath: tmpFile(), now: () => t, ttlDays: 14 });
    m.add("那天很安静", "calm", 0.7);
    t += 20 * 86_400_000;
    m.prune();
    expect(m.list().filter((e) => e.archived !== true)).toHaveLength(0);
  });

  it("显式遗忘 + 持久化往返", () => {
    const file = tmpFile();
    const m1 = createFeelingMemory({ filePath: file });
    m1.add("有点难过", "sad");
    expect(m1.forget("难过")).toBe(1);
    const m2 = createFeelingMemory({ filePath: file });
    expect(m2.list()).toHaveLength(1);
    expect(m2.list()[0]!.archived).toBe(true);
  });

  it("写入 feeling-memory 证据产物", () => {
    writeEvidenceLog("feeling-memory.test", ["emotion-tagged items; intensity decay; ttl; forget; persistence"], true);
  });
});
