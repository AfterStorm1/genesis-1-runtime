// 滚动内存历史（MemoryStore 最小实现）：轮数上限 / recall 形状 / 校验 / 清空
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

  it("超出轮数上限时滚动淘汰最旧", async () => {
    const store = createInMemoryHistoryStore({ maxTurns: 2 }); // 最多 4 条
    for (let i = 1; i <= 5; i++) {
      store.saveTurn("user", `u${i}`);
      store.saveTurn("assistant", `a${i}`);
    }
    const r = await store.recall({ input: dummyInput, limit: 20 });
    expect(r?.items.map((i) => i.content)).toEqual(["u4", "a4", "u5", "a5"]);
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
    writeEvidenceLog("history-store.test", ["rolling limit; recall shape; validation"], true);
  });
});
