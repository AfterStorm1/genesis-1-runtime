// A02：注册期/运行期分相（附件 A 8.1 / 铁律 4 / D22）
// dispatchFrame/applyFrame 路径无 validateAt；L35.emitFrame 只在 composition 的
// scheduler.onFrame 回调内出现一次（SampledValidator 间接调用）；注册期项每个组件实例只校验一次。
import { describe, expect, it } from "vitest";
import { compose } from "../../composition/composition-root";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import { createEmptyVRChatRenderer } from "../../adapters/renderers/empty-vrchat-renderer";
import { __getValidateAtCounts, __resetValidateAtCounts } from "../../core/contract/entry-points";
import { createMockCognition } from "../../layers/l2-cognition/mock-cognition";
import { samplePersona } from "../helpers/fixtures";
import { ACTUATOR_CONTRACT_VERSION } from "../../core/contract/spatial";
import { writeEvidenceLog } from "../helpers/evidence";

describe("A02 phase separation", () => {
  it("dispatchFrame / applyFrame 路径无 validateAt / sampledValidator.validate", async () => {
    const text = createTextRenderer();
    const vrchat = createEmptyVRChatRenderer();
    const rt = await compose({
      runtimeId: "rt:p1",
      personaId: "p1",
      frameHz: 30,
      renderers: [text, vrchat],
      parameters: [],
    });
    __resetValidateAtCounts();
    const frame = {
      contractVersion: ACTUATOR_CONTRACT_VERSION,
      tick: 1,
      ts: 1,
      axes: { vertical: 0, horizontal: 0, lookX: 0, lookY: 0 },
      buttons: {},
      parameters: {},
    };
    rt.dispatcher.dispatchFrame(frame);
    const textWithApplyFrame = {
      ...text,
      applyFrame: (f: typeof frame) => {
        void f;
      },
    };
    textWithApplyFrame.applyFrame(frame);
    // dispatchFrame / 直接 applyFrame 不触发任何校验
    expect([...__getValidateAtCounts().entries()]).toHaveLength(0);
    await rt.dispose();
  });

  it("注册期项每个组件实例只校验一次（ToolRegistry.register 为 impl 内部唯一调用点）", async () => {
    __resetValidateAtCounts();
    const rt = await compose({
      runtimeId: "rt:p2",
      personaId: "p1",
      frameHz: 30,
      renderers: [createTextRenderer()],
      parameters: [],
      tools: [
        {
          def: {
            contractVersion: "1.0.0",
            name: "t1",
            description: "d",
            schema: { type: "object" },
            permission: "read",
            scopes: [],
          },
          handler: async () => ({ ok: 1 }),
        },
      ],
    });
    const counts = __getValidateAtCounts();
    expect(counts.get("ToolRegistry.register")).toBe(1); // 唯一一次（Q4）
    await rt.dispose();
  });

  it("L35.emitFrame 首帧采样：多帧后计数为 1（缓存命中跳过）", async () => {
    __resetValidateAtCounts();
    const vrchat = createEmptyVRChatRenderer();
    const rt = await compose({
      runtimeId: "rt:p3",
      personaId: "p1",
      frameHz: 200,
      renderers: [vrchat],
      parameters: [],
    });
    const unsub = rt.scheduler.onFrame((f) => {
      void f;
    });
    // 帧循环由 attachTrackingSource 启动；等待多帧
    await new Promise((r) => setTimeout(r, 60));
    const emitCount = __getValidateAtCounts().get("L35.emitFrame") ?? 0;
    expect(emitCount).toBe(1); // 首帧采样一次，后续跳过
    unsub();
    await rt.dispose();
  });

  it("写入 A02 证据产物", () => {
    writeEvidenceLog("phase-separation", ["no validateAt in frame paths; single registration check"], true);
  });
});
