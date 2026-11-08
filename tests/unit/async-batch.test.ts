// A09：AsyncIterable 清理（附件 A 8.1 / 3.8 批次边界 / P1-R1 / D32）
// 注意：本文件用「原生 Cognition」直接返回可控迭代器——若经 mock cognition 的
// toIterable 包装，pipeline 的 return() 会落在悬停中的外层 async generator 上
// （return 完成信号需等内部 await 结算才被处理），可控迭代器收不到调用。
import { describe, expect, it } from "vitest";
import { compose } from "../../composition/composition-root";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import { createControlledIter, waitForTruthy } from "../helpers/fixtures";
import type { Cognition, CognitionOutput } from "../../core/contract/cognition";
import { writeEvidenceLog } from "../helpers/evidence";

const out = (): CognitionOutput => ({
  contractVersion: "1.0.0",
  kind: "state_update",
  patch: {},
});

/** 原生 Cognition：onInput 直接返回给定 AsyncIterable（不包 toIterable） */
function rawCognition(iter: AsyncIterable<CognitionOutput>): Cognition {
  return {
    id: "cognition:raw",
    async mount() {},
    onInput() {
      return iter;
    },
    dispose() {},
  };
}

describe("A09 async batch", () => {
  it("超时：调 iterator.return()；计时器释放；已收 outputs 正常聚合", async () => {
    const controlled = createControlledIter();
    const text = createTextRenderer();
    const rt = await compose({
      runtimeId: "rt:a09t",
      personaId: "p",
      frameHz: 30,
      renderers: [text],
      parameters: [],
      cognition: rawCognition(controlled.iter),
      batchTimeoutMs: 50,
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    controlled.push(out());
    // 超时截断：骨架必须在 50ms 计时器触发时调用 return()
    expect(await waitForTruthy(() => controlled.iter.returnCalls >= 1, 2000)).toBe(true);
    expect(controlled.iter.returnCalls).toBeGreaterThanOrEqual(1);
    await rt.dispose();
  });

  it("超限：maxBatchOutputs 截断 + return()", async () => {
    const controlled = createControlledIter();
    const text = createTextRenderer();
    const rt = await compose({
      runtimeId: "rt:a09l",
      personaId: "p",
      frameHz: 30,
      renderers: [text],
      parameters: [],
      cognition: rawCognition(controlled.iter),
      batchTimeoutMs: 5000,
      maxBatchOutputs: 2,
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    controlled.push(out(), out(), out(), out(), out());
    expect(await waitForTruthy(() => controlled.iter.returnCalls >= 1, 2000)).toBe(true);
    expect(controlled.iter.returnCalls).toBeGreaterThanOrEqual(1);
    await rt.dispose();
  });

  it("迭代器抛错：整批失败不产 signal；必须 return() 清理", async () => {
    const controlled = createControlledIter();
    const text = createTextRenderer();
    const rt = await compose({
      runtimeId: "rt:a09e",
      personaId: "p",
      frameHz: 30,
      renderers: [text],
      parameters: [],
      cognition: rawCognition(controlled.iter),
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    controlled.push(out());
    controlled.fail(new Error("boom"));
    expect(await waitForTruthy(() => controlled.iter.returnCalls >= 1, 2000)).toBe(true);
    expect(text.applied).toHaveLength(0); // 整批失败
    expect(rt.arbiter.activeSignals()).toHaveLength(0);
    await rt.dispose();
  });

  it("Promise 路径：单 output 直接 validateAt 后进 pendingOutputs，不受批次约束", async () => {
    // 原生 Cognition 返回 Promise<CognitionOutput>（不经 AsyncIterable 包装）
    const text = createTextRenderer();
    const promiseCognition: Cognition = {
      id: "cognition:promise",
      async mount() {},
      onInput() {
        return Promise.resolve<CognitionOutput>({
          contractVersion: "1.0.0",
          kind: "emotion",
          intent: { emotion: "happy", intensity: 0.5, contextTags: [] },
        });
      },
      dispose() {},
    };
    const rt = await compose({
      runtimeId: "rt:a09p",
      personaId: "persona:a09p",
      frameHz: 30,
      renderers: [text],
      parameters: [],
      cognition: promiseCognition,
      batchTimeoutMs: 1, // 极短批次超时：Promise 路径不受影响
      maxBatchOutputs: 1, // 极低批次上限：Promise 路径不受影响
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    expect(await waitForTruthy(() => text.applied.length >= 1, 2000)).toBe(true);
    expect(text.applied).toHaveLength(1); // 单 output 正常聚合出 1 个 signal
    await rt.dispose();
  });

  it("逐 item validateAt：坏版本 output 使整批失败", async () => {
    const controlled = createControlledIter();
    const text = createTextRenderer();
    const rt = await compose({
      runtimeId: "rt:a09v",
      personaId: "p",
      frameHz: 30,
      renderers: [text],
      parameters: [],
      cognition: rawCognition(controlled.iter),
    });
    rt.inputBus.inject({ kind: "user_message", text: "hi" });
    controlled.push({ contractVersion: "0.1.0", kind: "state_update", patch: {} });
    controlled.end();
    expect(await waitForTruthy(() => controlled.iter.returnCalls >= 1, 2000)).toBe(true);
    expect(text.applied).toHaveLength(0); // 整批失败
    await rt.dispose();
  });

  it("写入 A09 证据产物", () => {
    writeEvidenceLog("async-batch.test", ["timeout/overlimit return(); throw fails batch; promise exempt"], true);
  });
});
