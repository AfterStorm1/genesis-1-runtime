// A16：反馈语义拆分（附件 A 8.1 / S-02 / D39 / P1-6）
import { describe, expect, it } from "vitest";
import { compose } from "../../composition/composition-root";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import { createMockSpeechRenderer } from "../../adapters/renderers/mock-speech-renderer";
import { createMockCognition } from "../../layers/l2-cognition/mock-cognition";
import { samplePersona, waitForTruthy } from "../helpers/fixtures";
import { FEEDBACK_CONTRACT_VERSION } from "../../core/contract/feedback";
import type { Renderer } from "../../core/contract/renderer";
import { writeEvidenceLog } from "../helpers/evidence";

describe("A16 feedback kinds", () => {
  it("signal_error 驱动 release（session → failed, feedback_error）", async () => {
    const throwing: Renderer = {
      id: "renderer:throw",
      capabilities: {
        modalities: ["text"],
        consumesFrames: false,
        supportsInterruption: true,
        contractRanges: {},
      },
      async mount() {},
      apply() {
        throw new Error("apply-boom");
      },
      dispose() {},
    };
    const rt = await compose({
      runtimeId: "rt:f1",
      personaId: "p1",
      frameHz: 10,
      renderers: [throwing],
      parameters: [],
      cognition: createMockCognition({ persona: samplePersona() }),
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    expect(await waitForTruthy(() => rt.speech.get("rt:f1:l3:1")?.state === "failed", 3000)).toBe(true);
    const s = rt.speech.get("rt:f1:l3:1");
    expect(s?.state).toBe("failed");
    expect(s?.releaseReason).toBe("feedback_error");
    await rt.dispose();
  });

  it("renderer_error 只记 logger + bus 系统事件，不改 session", async () => {
    const busEvents: string[] = [];
    const rt = await compose({
      runtimeId: "rt:f2",
      personaId: "p1",
      frameHz: 10,
      renderers: [createMockSpeechRenderer({ doneDelayMs: 5000 })],
      parameters: [],
      cognition: createMockCognition({ persona: samplePersona() }),
    });
    rt.bus.subscribe(() => true, (e) => busEvents.push(e.type));
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    expect(await waitForTruthy(() => rt.speech.get("rt:f2:l3:1")?.state === "playing", 3000)).toBe(true);
    rt.feedback.publish({
      contractVersion: FEEDBACK_CONTRACT_VERSION,
      ts: Date.now(),
      runtimeId: "rt:f2",
      sourceId: "renderer:speech",
      kind: "renderer_error",
      error: "gpu-lost",
    });
    expect(await waitForTruthy(() => busEvents.includes("system.renderer_error"), 2000)).toBe(true);
    // session 不受 renderer_error 影响
    expect(rt.speech.get("rt:f2:l3:1")?.state).toBe("playing");
    // active signal 仍在（不驱动 release）
    expect(rt.arbiter.activeSignals()).toHaveLength(1);
    await rt.dispose();
  });

  it("写入 A16 证据产物", () => {
    writeEvidenceLog("feedback-kinds.test", ["signal_error releases; renderer_error logger+bus only"], true);
  });
});
