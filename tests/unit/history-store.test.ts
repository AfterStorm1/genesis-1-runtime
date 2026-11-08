// 滚动对话记忆（MemoryStore 最小实现）：recall 形状 / 持久化往返 / 校验 / 清空
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryHistoryStore } from "../../adapters/llm/in-memory-history-store";
import { samplePersona } from "../helpers/fixtures";
import type { CognitionInput } from "../../core/contract/cognition";
import { writeEvidenceLog } from "../helpers/evidence";

const dummyInput: CognitionInput = {
  contractVersion: "1.0.0",
  kind: "user_message",
  text: "",
  persona: samplePersona("probe"),
};

describe("in-memory history store", () => {
  it("recall 返回最近条目（role/content/ts）；空历史返回 undefined", async () => {
    const store = createInMemoryHistoryStore({ maxTurns: 5 });
    expect(await store.recall({ input: dummyInput, limit: 10 })).toBeUndefined();
    store.saveTurn("user", "你好");
    store.saveTurn("assistant", "你好，我是 Kaguya");
    const r = await store.recall({ input: dummyInput, limit: 10 });
    expect(r?.items).toHaveLength(2);
    expect(r?.items[0]).toMatchObject({ role: "user", content: "你好" });
    expect(r?.items[1]).toMatchObject({ role: "assistant", content: "你好，我是 Kaguya" });
    expect(typeof r?.items[0]?.ts).toBe("number");
  });

  it("recall 默认只取最近 maxTurns*2 条（提示词用），limit 可指定更多", async () => {
    const store = createInMemoryHistoryStore({ maxTurns: 2 }); // 默认 4 条
    for (let i = 1; i <= 5; i++) {
      store.saveTurn("user", `u${i}`);
      store.saveTurn("assistant", `a${i}`);
    }
    expect(store.list()).toHaveLength(10); // 内存保留全部（上限 500）
    const r = await store.recall({ input: dummyInput });
    expect(r?.items.map((i) => i.content)).toEqual(["u4", "a4", "u5", "a5"]);
    const rAll = await store.recall({ input: dummyInput, limit: 100 });
    expect(rAll?.items).toHaveLength(10);
  });

  it("filePath 持久化：重启（新实例）后历史自动恢复", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-hist-"));
    const file = path.join(dir, "Kaguya.jsonl");
    const store1 = createInMemoryHistoryStore({ maxTurns: 10, filePath: file });
    store1.saveTurn("user", "你叫什么");
    store1.saveTurn("assistant", "Kaguya");
    // 模拟重启：新实例读同一文件
    const store2 = createInMemoryHistoryStore({ maxTurns: 10, filePath: file });
    const r = await store2.recall({ input: dummyInput, limit: 10 });
    expect(r?.items.map((i) => i.content)).toEqual(["你叫什么", "Kaguya"]);
    // clear 同时清空文件
    store2.clear();
    const store3 = createInMemoryHistoryStore({ maxTurns: 10, filePath: file });
    expect(store3.list()).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("save(event) 只接受合法形状；空白内容忽略", async () => {
    const store = createInMemoryHistoryStore();
    await store.save({ role: "user", content: "ok" });
    await store.save({ role: "system", content: "bad" }); // 非法角色 → 忽略
    await store.save("garbage");
    store.saveTurn("user", "   ");
    expect(store.list()).toHaveLength(1);
  });

  it("list / clear", async () => {
    const store = createInMemoryHistoryStore();
    store.saveTurn("user", "a");
    expect(store.list()).toHaveLength(1);
    store.clear();
    expect(store.list()).toHaveLength(0);
    expect(await store.recall({ input: dummyInput, limit: 5 })).toBeUndefined();
  });

  it("写入 history-store 证据产物", () => {
    writeEvidenceLog("history-store.test", ["recall shape; persistence roundtrip; validation"], true);
  });
});
