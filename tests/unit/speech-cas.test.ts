// A05：SpeechSession CAS + 创建时机（附件 A 8.1 / 3.4.1 映射表）
import { describe, expect, it } from "vitest";
import { createSpeechSessionStore, TRANSITIONS } from "../../core/speech/speech-session-store-impl";
import { FEEDBACK_CONTRACT_VERSION } from "../../core/contract/feedback";
import type { RendererFeedback } from "../../core/contract/feedback";
import { writeEvidenceLog } from "../helpers/evidence";

function fb(kind: RendererFeedback["kind"], signalId: string, extra: Partial<RendererFeedback> = {}): RendererFeedback {
  return {
    contractVersion: FEEDBACK_CONTRACT_VERSION,
    ts: 1,
    runtimeId: "rt:test",
    sourceId: "renderer:speech",
    kind,
    signalId,
    ...extra,
  } as RendererFeedback;
}

describe("A05 SpeechSession CAS", () => {
  it("create 幂等：重复 create 返回原 session", () => {
    const store = createSpeechSessionStore();
    const a = store.create("s1");
    expect(a.state).toBe("requested");
    const b = store.create("s1");
    expect(b).toBe(a);
  });

  it("允许 requested → playing（S-04）", () => {
    expect(TRANSITIONS.requested).toContain("playing");
    const store = createSpeechSessionStore();
    store.create("s1");
    store.onFeedback(fb("audio_started", "s1"));
    expect(store.get("s1")!.state).toBe("playing");
  });

  it("映射表全覆盖（audio_started / audio_done / interrupted / signal_error / viseme_ready / renderer_error）", () => {
    const store = createSpeechSessionStore();
    // viseme_ready：状态不变，写 visemeTimeline
    store.create("s1");
    store.onFeedback(fb("viseme_ready", "s1", { visemeTimeline: [{ timeMs: 0, viseme: "a" }] }));
    expect(store.get("s1")!.state).toBe("requested");
    expect(store.get("s1")!.visemeTimeline).toEqual([{ timeMs: 0, viseme: "a" }]);
    // audio_started → playing + audioRef
    store.onFeedback(fb("audio_started", "s1", { audioRef: "ref-1" }));
    expect(store.get("s1")!.state).toBe("playing");
    expect(store.get("s1")!.audioRef).toBe("ref-1");
    // audio_done → done + feedback_done
    store.onFeedback(fb("audio_done", "s1"));
    expect(store.get("s1")!.state).toBe("done");
    expect(store.get("s1")!.releaseReason).toBe("feedback_done");
    // 终态后 viseme_ready 幂等丢弃（不写 timeline）
    store.onFeedback(fb("viseme_ready", "s1", { visemeTimeline: [{ timeMs: 5, viseme: "x" }] }));
    expect(store.get("s1")!.visemeTimeline).toEqual([{ timeMs: 0, viseme: "a" }]);
    // interrupted（新会话）
    store.create("s2");
    store.onFeedback(fb("interrupted", "s2"));
    expect(store.get("s2")!.state).toBe("interrupted");
    expect(store.get("s2")!.releaseReason).toBe("interrupted");
    // interrupted 后 viseme_ready 丢弃
    store.onFeedback(fb("viseme_ready", "s2", { visemeTimeline: [{ timeMs: 0, viseme: "a" }] }));
    expect(store.get("s2")!.visemeTimeline).toBeUndefined();
    // signal_error → failed + feedback_error + error
    store.create("s3");
    store.onFeedback(fb("signal_error", "s3", { error: "boom" }));
    expect(store.get("s3")!.state).toBe("failed");
    expect(store.get("s3")!.releaseReason).toBe("feedback_error");
    expect(store.get("s3")!.error).toBe("boom");
    // renderer_error：不改 session
    store.create("s4");
    store.onFeedback({ ...fb("renderer_error", "s4", { error: "x" }), signalId: undefined } as RendererFeedback);
    expect(store.get("s4")!.state).toBe("requested");
  });

  it("先到先赢：终态写入后 CAS 失败幂等忽略", () => {
    const store = createSpeechSessionStore();
    store.create("s1");
    store.onFeedback(fb("audio_done", "s1")); // playing 不在允许集 → CAS 失败，状态不变
    expect(store.get("s1")!.state).toBe("requested");
    store.onFeedback(fb("audio_started", "s1"));
    store.onFeedback(fb("audio_done", "s1"));
    expect(store.get("s1")!.state).toBe("done");
    // 再来 interrupted：终态幂等
    store.onFeedback(fb("interrupted", "s1"));
    expect(store.get("s1")!.state).toBe("done");
    expect(store.get("s1")!.releaseReason).toBe("feedback_done");
  });

  it("onRelease 与 feedback 并发：均走 CAS，先到先赢", () => {
    const store = createSpeechSessionStore();
    store.create("s1");
    store.onRelease("s1", "cancelled");
    expect(store.get("s1")!.state).toBe("interrupted");
    expect(store.get("s1")!.releaseReason).toBe("cancelled");
    store.onFeedback(fb("audio_done", "s1")); // 终态忽略
    expect(store.get("s1")!.state).toBe("interrupted");
  });

  it("dispose 将非终态推进 failed(cancelled)；终态不动", () => {
    const store = createSpeechSessionStore();
    store.create("a");
    store.create("b");
    store.onFeedback(fb("audio_started", "b"));
    store.onFeedback(fb("audio_done", "b"));
    store.dispose();
    expect(store.get("a")!.state).toBe("failed");
    expect(store.get("a")!.releaseReason).toBe("cancelled");
    expect(store.get("b")!.state).toBe("done"); // 终态不动
  });

  it("写入 A05 证据产物", () => {
    writeEvidenceLog("speech-cas.test", ["mapping table; first-write-wins; dispose fallback"], true);
  });
});
