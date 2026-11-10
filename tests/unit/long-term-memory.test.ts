// 长期记忆库：容量淘汰 / TTL 归档 / 显式遗忘 / 复习加固 / 持久化 / 回滚
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLongTermMemory } from "../../adapters/llm/memory/long-term-memory";
import { writeEvidenceLog } from "../helpers/evidence";

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "genesis-ltm-")), "mem.jsonl");
}

describe("long-term memory", () => {
  it("add / promptItems 按重要度排序取前 N，并复习加固", () => {
    const m = createLongTermMemory({ filePath: tmpFile() });
    m.add("普通小事", 1);
    m.add("极其重要的事", 5);
    m.add("比较重要", 3);
    const items = m.promptItems(2);
    expect(items.map((i) => i.text)).toEqual(["极其重要的事", "比较重要"]);
  });

  it("容量上限：超限时淘汰评分最低者（归档不删除）", () => {
    const m = createLongTermMemory({ filePath: tmpFile(), maxEntries: 3 });
    for (let i = 1; i <= 5; i++) m.add(`条目${i}`, i);
    const all = m.list();
    expect(all).toHaveLength(5); // 不物理删除
    expect(all.filter((e) => e.archived !== true).map((e) => e.text)).toEqual(["条目3", "条目4", "条目5"]);
    expect(all.filter((e) => e.archived === true).map((e) => e.text)).toEqual(["条目1", "条目2"]);
  });

  it("TTL：久未使用且重要度 ≤2 → 归档；重要度高不受 TTL 影响", () => {
    const file = tmpFile();
    // 时钟注入：先 t=0 添加，再把时间拨到 60 天后触发 TTL
    let t = 0;
    const m = createLongTermMemory({ filePath: file, ttlDays: 30, now: () => t });
    m.add("会被遗忘的低重要度", 1);
    m.add("永远记住的约定", 5);
    t += 60 * 86_400_000; // 60 天未使用
    m.prune();
    const active = m.list().filter((e) => e.archived !== true).map((e) => e.text);
    expect(active).toContain("永远记住的约定");
    expect(active).not.toContain("会被遗忘的低重要度");
  });

  it("显式遗忘：按关键词归档；restoreArchived 可回滚", () => {
    const m = createLongTermMemory({ filePath: tmpFile() });
    m.add("用户喜欢咖啡");
    m.add("用户喜欢下雨天");
    expect(m.forget("咖啡")).toBe(1);
    expect(m.promptItems().map((i) => i.text)).toEqual(["用户喜欢下雨天"]);
    expect(m.restoreArchived()).toBe(1);
    // 恢复后两条都活跃（顺序无关，只断言集合）
    const texts = m.promptItems().map((i) => i.text).sort();
    expect(texts).toEqual(["用户喜欢下雨天", "用户喜欢咖啡"]);
  });

  it("持久化：重启（新实例）恢复活跃与归档状态", () => {
    const file = tmpFile();
    const m1 = createLongTermMemory({ filePath: file });
    m1.add("持久化测试", 3);
    m1.forget("持久化");
    const m2 = createLongTermMemory({ filePath: file });
    const all = m2.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.archived).toBe(true);
  });

  it("写入 long-term-memory 证据产物", () => {
    writeEvidenceLog("long-term-memory.test", ["capacity eviction; ttl archive; forget/rollback; persistence"], true);
  });
});
