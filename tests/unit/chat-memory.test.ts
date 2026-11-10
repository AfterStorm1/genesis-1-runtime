// 组合记忆（ChatMemory）：recall 一次返回「第一人称感受 + 长期事实 + 最近轮次」；
// 顺序：feeling → memory → 轮次。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createChatMemory } from "../../adapters/llm/memory/chat-memory";
import { createInMemoryHistoryStore } from "../../adapters/llm/memory/in-memory-history-store";
import { createLongTermMemory } from "../../adapters/llm/memory/long-term-memory";
import { createFeelingMemory } from "../../adapters/llm/memory/feeling-memory";
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
  const feelings = createFeelingMemory({ filePath: path.join(dir, "fl.jsonl") });
  return { chat: createChatMemory({ turns, longTerm, feelings }), turns, longTerm, feelings, dir };
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

  it("感受层合并：feeling 条目排最前（内容带情绪词前缀）", async () => {
    const { chat, longTerm, feelings, dir } = makeChatMemory();
    longTerm.add("用户叫小明");
    feelings.add("一起修书很安静，我有点喜欢", "calm", 0.8);
    const r = await chat.recall({ input: dummyInput });
    expect(r?.items.map((i) => i.role)).toEqual(["feeling", "memory"]);
    expect(r?.items[0]!.content).toBe("calm：一起修书很安静，我有点喜欢");
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
