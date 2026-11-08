// A15：Renderer.mount 生命周期（附件 A 8.1 / G-03）
import { describe, expect, it } from "vitest";
import { compose } from "../../composition/composition-root";
import type { Renderer } from "../../core/contract/renderer";
import { writeEvidenceLog } from "../helpers/evidence";

function mk(id: string, order: string[], fail?: string): Renderer {
  return {
    id,
    capabilities: {
      modalities: ["text"] as const,
      consumesFrames: false,
      supportsInterruption: true,
      contractRanges: {},
    },
    async mount() {
      order.push(`mount:${id}`);
      if (fail === id) throw new Error(`mount-fail:${id}`);
    },
    apply() {},
    dispose() {
      order.push(`dispose:${id}`);
    },
  };
}

describe("A15 renderer mount", () => {
  it("顺序 await；成功后 register", async () => {
    const order: string[] = [];
    const rt = await compose({
      runtimeId: "rt:m1",
      personaId: "p1",
      frameHz: 10,
      renderers: [mk("a", order), mk("b", order)],
      parameters: [],
    });
    expect(order).toEqual(["mount:a", "mount:b"]);
    expect(rt.registry.list().map((r) => r.id)).toEqual(["a", "b"]);
    await rt.dispose();
    expect(order.slice(-2)).toEqual(["dispose:b", "dispose:a"]); // 反序
  });

  it("任一步 mount 失败：已 mount 按反序 dispose；抛带信息的错误；未 mount 不 dispose", async () => {
    const order: string[] = [];
    await expect(
      compose({
        runtimeId: "rt:m2",
        personaId: "p1",
        frameHz: 10,
        renderers: [mk("a", order), mk("b", order, "b"), mk("c", order)],
        parameters: [],
      }),
    ).rejects.toThrow(/renderer_mount_failed:mount-fail:b/);
    // a 已 mount → 被反序 dispose；b 失败（mount 中抛错，未入 mounted）→ 不 dispose；c 未开始
    expect(order).toEqual(["mount:a", "mount:b", "dispose:a"]);
  });

  it("写入 A15 证据产物", () => {
    writeEvidenceLog("renderer-mount.test", ["sequential await; reverse cleanup on failure"], true);
  });
});
