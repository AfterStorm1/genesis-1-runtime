// A11：dispose 全链路（附件 A 8.1 / 4.3 / D30 / D52）
import { describe, expect, it, vi } from "vitest";
import { compose } from "../../composition/composition-root";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import { createMockCognition } from "../../layers/l2-cognition/mock-cognition";
import { createMockSpeechRenderer } from "../../adapters/renderers/mock-speech-renderer";
import { samplePersona, waitForTruthy } from "../helpers/fixtures";
import type { Renderer } from "../../core/contract/renderer";
import type { PipelineHook } from "../../core/contract/pipeline-hook";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../../core/contract/pipeline-hook";
import { writeEvidenceLog } from "../helpers/evidence";

function orderedRenderer(id: string, order: string[]): Renderer {
  return {
    id,
    capabilities: {
      modalities: ["text"],
      consumesFrames: false,
      supportsInterruption: true,
      contractRanges: {},
    },
    async mount() {
      order.push(`mount:${id}`);
    },
    apply() {},
    dispose() {
      order.push(`dispose:${id}`);
    },
  };
}

describe("A11 dispose", () => {
  it("固定顺序 + renderers 反序 + arbiter.dispose 触发的 onRelease 到达 speech.onRelease", async () => {
    const order: string[] = [];
    const rt = await compose({
      runtimeId: "rt:d1",
      personaId: "p1",
      frameHz: 10,
      renderers: [orderedRenderer("r1", order), orderedRenderer("r2", order)],
      parameters: [],
      cognition: createMockCognition({ persona: samplePersona() }),
    });
    const releaseSpy = vi.fn();
    const orig = rt.speech.onRelease.bind(rt.speech);
    rt.speech.onRelease = (id, reason) => {
      releaseSpy(id, reason);
      orig(id, reason);
    };
    // 让一个信号进入 active（带 speech → 创建 session）
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    expect(await waitForTruthy(() => rt.speech.get("rt:d1:l3:1") !== undefined, 3000)).toBe(true);
    const sessionId = "rt:d1:l3:1";
    expect(rt.speech.get(sessionId)).toBeDefined();

    await rt.dispose();
    // renderers 反序
    const m1 = order.indexOf("mount:r1");
    const m2 = order.indexOf("mount:r2");
    const d1 = order.indexOf("dispose:r1");
    const d2 = order.indexOf("dispose:r2");
    expect(m1).toBeLessThan(m2); // 顺序 mount
    expect(d2).toBeLessThan(d1); // 反序 dispose
    // onRelease 到达 speech.onRelease（arbiter.dispose 取消 active signal）
    expect(releaseSpy).toHaveBeenCalledWith(sessionId, "cancelled");
    expect(rt.arbiter.activeSignals()).toHaveLength(0);
  });

  it("sharedBus 不 dispose", async () => {
    const shared = {
      publish() {},
      subscribe() {
        return () => {};
      },
      dispose: vi.fn(),
    };
    const rt = await compose({
      runtimeId: "rt:d2",
      personaId: "p1",
      frameHz: 10,
      sharedBus: shared,
      renderers: [createTextRenderer()],
      parameters: [],
    });
    await rt.dispose();
    expect(shared.dispose).not.toHaveBeenCalled();
  });

  it("失败聚合 AggregateError 且 message 含失败 step", async () => {
    const failingHook: PipelineHook = {
      id: "hook:fail",
      contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
      stage: "beforeCognition",
      process: (p) => p,
      dispose() {
        throw new Error("hook-dispose-fail");
      },
    };
    const failingRenderer: Renderer = {
      id: "renderer:fail",
      capabilities: {
        modalities: ["text"],
        consumesFrames: false,
        supportsInterruption: true,
        contractRanges: {},
      },
      async mount() {},
      apply() {},
      dispose() {
        throw new Error("renderer-dispose-fail");
      },
    };
    const rt = await compose({
      runtimeId: "rt:d3",
      personaId: "p1",
      frameHz: 10,
      renderers: [failingRenderer],
      parameters: [],
      hooks: [failingHook],
    });
    let err: unknown;
    try {
      await rt.dispose();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AggregateError);
    const msg = (err as AggregateError).message;
    expect(msg).toContain("hooks");
    expect(msg).toContain("renderers");
  });

  it("1 个失败抛原错误", async () => {
    const failingRenderer: Renderer = {
      id: "renderer:fail",
      capabilities: {
        modalities: ["text"],
        consumesFrames: false,
        supportsInterruption: true,
        contractRanges: {},
      },
      async mount() {},
      apply() {},
      dispose() {
        throw new Error("only-fail");
      },
    };
    const rt = await compose({
      runtimeId: "rt:d4",
      personaId: "p1",
      frameHz: 10,
      renderers: [failingRenderer],
      parameters: [],
    });
    await expect(rt.dispose()).rejects.toThrow("only-fail");
  });

  it("写入 A11 证据产物", () => {
    writeEvidenceLog("dispose.test", ["fixed order; reverse renderers; sharedBus kept; AggregateError steps"], true);
  });
});
