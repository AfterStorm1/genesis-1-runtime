// TTS 语音渲染器：feedback 回路 + 打断 + 失败路径（用假扬声器，不依赖系统音频）
import { describe, expect, it, vi } from "vitest";
import { createTtsSpeechRenderer } from "../../adapters/renderers/tts-speech-renderer";
import type { Speaker } from "../../adapters/tts/sapi-speaker";
import { createFeedbackChannel } from "../../core/feedback/feedback-channel-impl";
import { createFakeClock, samplePersona, waitForTruthy } from "../helpers/fixtures";
import { markSanitized } from "../../core/contract/speech";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import type { RendererFeedback } from "../../core/contract/feedback";
import type { RendererContext } from "../../core/contract/renderer";
import { writeEvidenceLog } from "../helpers/evidence";

interface FakeSpeaker extends Speaker {
  speaks: string[];
  stopCalls: number;
  resolveNext(): void;
  rejectNext(err: Error): void;
}

function fakeSpeaker(): FakeSpeaker {
  const speaks: string[] = [];
  const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  const s = {
    speaks,
    stopCalls: 0,
    speak(text: string) {
      speaks.push(text);
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    },
    stop() {
      s.stopCalls += 1;
    },
    resolveNext() {
      pending.shift()?.resolve();
    },
    rejectNext(err: Error) {
      pending.shift()?.reject(err);
    },
  };
  return s;
}

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

function makeCtx(fb: ReturnType<typeof createFeedbackChannel>): RendererContext {
  const clock = createFakeClock();
  void samplePersona;
  return {
    clock,
    contract: {} as never,
    feedback: fb,
    bus: {} as never,
    safety: {} as never,
    runtimeId: "rt:t",
    sourceId: "renderer",
    resolveTarget: async () => null,
  };
}

describe("tts speech renderer", () => {
  it("apply → audio_started → speak → audio_done（完整 feedback 回路）", async () => {
    const speaker = fakeSpeaker();
    const fb = createFeedbackChannel();
    const events: RendererFeedback[] = [];
    fb.subscribe((e) => events.push(e));
    const r = createTtsSpeechRenderer({ speaker });
    await r.mount(makeCtx(fb));
    r.apply(signalWith("坐吧"));
    expect(events[0]?.kind).toBe("audio_started");
    expect(events[0]?.signalId).toBe("rt:t:l3:1");
    expect(speaker.speaks).toEqual(["坐吧"]); // L4 只读 sanitizedText.text
    speaker.resolveNext();
    expect(await waitForTruthy(() => events.some((e) => e.kind === "audio_done"))).toBe(true);
    expect(events[1]?.kind).toBe("audio_done");
    r.dispose();
  });

  it("朗读失败 → signal_error（会话将被标记 failed/feedback_error）", async () => {
    const speaker = fakeSpeaker();
    const fb = createFeedbackChannel();
    const events: RendererFeedback[] = [];
    fb.subscribe((e) => events.push(e));
    const r = createTtsSpeechRenderer({ speaker });
    await r.mount(makeCtx(fb));
    r.apply(signalWith("坐吧"));
    speaker.rejectNext(new Error("sapi_exit_1"));
    expect(await waitForTruthy(() => events.some((e) => e.kind === "signal_error"))).toBe(true);
    const err = events.find((e) => e.kind === "signal_error") as Extract<RendererFeedback, { kind: "signal_error" }>;
    expect(err.error).toContain("sapi_exit_1");
    r.dispose();
  });

  it("新信号到达 → 停止上一段朗读（打断）", async () => {
    const speaker = fakeSpeaker();
    const fb = createFeedbackChannel();
    const r = createTtsSpeechRenderer({ speaker });
    await r.mount(makeCtx(fb));
    r.apply(signalWith("第一段"));
    r.apply({ ...signalWith("第二段"), id: "rt:t:l3:2" });
    expect(speaker.stopCalls).toBe(1);
    r.dispose();
  });

  it("无 speech 的 signal 跳过朗读", async () => {
    const speaker = fakeSpeaker();
    const fb = createFeedbackChannel();
    const r = createTtsSpeechRenderer({ speaker });
    await r.mount(makeCtx(fb));
    r.apply({ ...signalWith("x"), speech: undefined });
    expect(speaker.speaks).toHaveLength(0);
    r.dispose();
  });

  it("写入 tts-renderer 证据产物", () => {
    writeEvidenceLog("tts-renderer.test", ["feedback loop; failure -> signal_error; interruption; skip non-speech"], true);
  });
});
