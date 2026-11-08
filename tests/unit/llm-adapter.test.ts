// LLM 适配器：回复解析 / 消息组装 / 请求构造（值级扩展的单元测试）
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMessages,
  buildSystemPrompt,
  createOpenAiCompatibleCognition,
  parseReply,
} from "../../adapters/llm/openai-compatible-cognition";
import { samplePersona } from "../helpers/fixtures";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import type { CognitionInput, CognitionOutput } from "../../core/contract/cognition";
import { writeEvidenceLog } from "../helpers/evidence";

const persona = samplePersona("Kaguya");

function userInput(text: string, recall?: CognitionInput["recall"]): CognitionInput {
  return { contractVersion: COGNITION_CONTRACT_VERSION, kind: "user_message", text, persona, recall };
}

describe("llm adapter parse", () => {
  it("标记行格式", () => {
    expect(parseReply("[EMOTION] calm\n[INTENSITY] 0.4\n[SPEECH] 你好。")).toEqual({
      emotion: "calm",
      intensity: 0.4,
      speech: "你好。",
    });
  });

  it("```json 围栏 JSON（旧格式兼容）", () => {
    const r = parseReply('```json\n{"emotion":"happy","intensity":0.6,"speech":"hi"}\n```');
    expect(r).toEqual({ emotion: "happy", intensity: 0.6, speech: "hi" });
  });

  it("兜底：非结构化文本整段当台词", () => {
    expect(parseReply("我就随便说两句。")).toEqual({ speech: "我就随便说两句。" });
  });

  it("只有情绪没有台词 → speech undefined", () => {
    expect(parseReply("[EMOTION] sad\n[INTENSITY] 0.9")).toEqual({
      emotion: "sad",
      intensity: 0.9,
      speech: undefined,
    });
  });

  it("情绪行 + 自由台词（模型忘记 [SPEECH] 标记时其余文本即台词）", () => {
    expect(parseReply("[EMOTION] calm\n嗯。月光正好，适合读书。你呢，怎么还没睡？")).toEqual({
      emotion: "calm",
      intensity: NaN,
      speech: "嗯。月光正好，适合读书。你呢，怎么还没睡？",
    });
  });
});

describe("llm adapter messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("system 提示词包含人格卡字段", () => {
    const s = buildSystemPrompt(persona);
    expect(s).toContain("Kaguya");
    expect(s).toContain("[SPEECH]");
  });

  it("记忆历史插入在 system 与当前输入之间；角色映射 assistant/user", () => {
    const msgs = buildMessages(
      userInput("你好", {
        items: [
          { role: "user", content: "你是谁" },
          { role: "assistant", content: "我是 Kaguya" },
        ],
      }),
      persona,
    );
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[1]!.content).toBe("你是谁");
    expect(msgs[2]!.content).toBe("我是 Kaguya");
    expect(msgs[3]!.content).toBe("你好");
  });

  it("fetch 请求：URL、消息体、apiKey → Authorization 头", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const stub = vi.fn(async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "[EMOTION] calm\n[SPEECH] 你好。" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", stub);

    const cognition = createOpenAiCompatibleCognition({
      persona,
      model: "test-model",
      baseUrl: "http://localhost:11434",
      apiKey: "sk-test",
    });
    const outputs = [];
    for await (const o of cognition.onInput(userInput("你好")) as AsyncIterable<CognitionOutput>) {
      outputs.push(o);
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(calls[0]!.init.body as string) as { model: string; messages: Array<{ role: string }> };
    expect(body.model).toBe("test-model");
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(outputs.map((o) => o.kind)).toEqual(["emotion", "speech"]);
  });

  it("HTTP 失败 → 降级台词（会话不静默）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    const cognition = createOpenAiCompatibleCognition({ persona });
    const outputs = [];
    for await (const o of cognition.onInput(userInput("hi")) as AsyncIterable<CognitionOutput>) {
      outputs.push(o);
    }
    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.kind).toBe("speech");
  });

  it("写入 llm-adapter 证据产物", () => {
    writeEvidenceLog("llm-adapter.test", ["parse formats; history injection; auth header; fallback"], true);
  });
});
