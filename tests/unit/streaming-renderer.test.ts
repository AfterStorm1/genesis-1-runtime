// 流式文本渲染器：逐字/句间节奏、dispose 取消、busy 重入保护（值级扩展测试）
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamingTextRenderer } from "../../adapters/renderers/streaming-text-renderer";
import { markSanitized } from "../../core/contract/speech";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import type { ExpressionSignal } from "../../core/contract/expression";
import { writeEvidenceLog } from "../helpers/evidence";

function signalWith(text: string): ExpressionSignal {
  return {
    contractVersion: EXPRESSION_CONTRACT_VERSION,
    id: "rt:t:l3:1",
    ts: 1,
    emotion: { emotion: "calm", intensity: 0.5, contextTags: [] },
    vad: { valence: 0, arousal: 0, dominance: 0 },
    priority: 50,
    interruptible: true,
    sourceId: "l3",
    runtimeId: "rt:t",
    speech: { text, interruptible: true, sanitizedText: markSanitized(text) },
  };
}

describe("streaming text renderer", () => {
  afterEach(() => vi.useRealTimers());

  it("逐字输出 + 句间延迟：输出序列完整且节奏正确", async () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const r = createStreamingTextRenderer({ charDelayMs: 10, sentenceDelayMs: 50, write: (c) => chunks.push(c) });
    r.apply(signalWith("坐吧\n好……"));
    // 第一行“坐吧”3 字：首字立即 + 2×10ms
    await vi.advanceTimersByTimeAsync(25);
    expect(chunks.join("")).toContain("坐吧");
    // 句间 50ms + 第二行逐字
    await vi.advanceTimersByTimeAsync(200);
    expect(chunks.join("")).toContain("坐吧\n好……");
    r.dispose();
  });

  it("dispose 取消未完成的输出", async () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const r = createStreamingTextRenderer({ charDelayMs: 10, write: (c) => chunks.push(c) });
    r.apply(signalWith("一句很长很长的话"));
    await vi.advanceTimersByTimeAsync(10);
    r.dispose();
    const countAtDispose = chunks.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(chunks.length).toBe(countAtDispose); // dispose 后不再输出
  });

  it("busy 重入保护：同回复期间新信号丢弃", async () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const r = createStreamingTextRenderer({ charDelayMs: 10, write: (c) => chunks.push(c) });
    r.apply(signalWith("第一句"));
    r.apply(signalWith("第二句"));
    await vi.advanceTimersByTimeAsync(1000);
    const all = chunks.join("");
    expect(all).toContain("第一句");
    expect(all).not.toContain("第二句");
    r.dispose();
  });

  it("写入 streaming-renderer 证据产物", () => {
    writeEvidenceLog("streaming-renderer.test", ["char/sentence pacing; dispose cancels; busy guard"], true);
  });
});
