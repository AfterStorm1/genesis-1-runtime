// 组合记忆（ChatMemory）：recall 一次返回「长期记忆条目 + 最近轮次」；
// 长期条目 role="memory" 排前，轮次按时间序排后。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createChatMemory } from "../../adapters/llm/chat-memory";
import { createInMemoryHistoryStore } from "../../adapters/llm/in-memory-history-store";
import { createLongTermMemory } from "../../adapters/llm/long-term-memory";
import { samplePersona } from "../helpers/fixtures";
import type { CognitionInput } from "../../core/contract/cognition";
import { writeEvidenceLog } from "../helpers/evidence";

const dummyInput: CognitionInput = {
  contractVersion: "1.0.0",
  kind: "user_message",
  text: "",
  persona: samplePersona("probe"),
};

function makeChatMemory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-cm-"));
  const turns = createInMemoryHistoryStore({ maxTurns: 10 });
  const longTerm = createLongTermMemory({ filePath: path.join(dir, "ltm.jsonl") });
  return { chat: createChatMemory({ turns, longTerm }), turns, longTerm, dir };
}

describe("chat memory (combined)", () => {
  it("recall 合并：长期记忆条目在前（role=memory），轮次在后", async () => {
    const { chat, turns, longTerm, dir } = makeChatMemory();
    longTerm.add("用户叫小明");
    turns.saveTurn("user", "你好");
    turns.saveTurn("assistant", "你好呀");
    const r = await chat.recall({ input: dummyInput });
    expect(r?.items.map((i) => i.role)).toEqual(["memory", "user", "assistant"]);
    expect(r?.items[0]!.content).toBe("用户叫小明");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("无任何记忆时 recall 返回 undefined", async () => {
    const { chat, dir } = makeChatMemory();
    expect(await chat.recall({ input: dummyInput })).toBeUndefined();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("save 转发给短期轮次存储", async () => {
    const { chat, turns, dir } = makeChatMemory();
    await chat.save({ role: "user", content: "转发测试" });
    expect(turns.list()).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("写入 chat-memory 证据产物", () => {
    writeEvidenceLog("chat-memory.test", ["merged recall: memory items first, turns after"], true);
  });
});
