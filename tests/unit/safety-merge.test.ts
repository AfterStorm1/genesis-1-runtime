// A03：安全 merge 只收紧 + 可观测（附件 A 8.1）
import { describe, expect, it } from "vitest";
import { SAFETY_DEFAULTS } from "../../core/contract/safety";
import { mergeSafetyDefaults } from "../../core/safety/merge";
import type { SafetyConfig } from "../../core/contract/runtime-config";
import { writeEvidenceLog } from "../helpers/evidence";

/** 测试用：以 object 构造 SafetyConfig（绕过 as const 字面量类型，便于传入越界值验证「只收紧」） */
function cfg(c: object): SafetyConfig {
  return c as SafetyConfig;
}

describe("A03 safety merge", () => {
  it("任意 cfg 不能放宽默认值", () => {
    const res = mergeSafetyDefaults(
      cfg({
        maxMoveSpeed: 99, // 想放宽 → 拒绝，保持默认
        maxJumpHeight: 9,
        maxSignalRateHz: 999,
      }),
    );
    expect(res.merged.maxMoveSpeed).toBe(SAFETY_DEFAULTS.maxMoveSpeed);
    expect(res.merged.maxJumpHeight).toBe(SAFETY_DEFAULTS.maxJumpHeight);
    expect(res.merged.maxSignalRateHz).toBe(SAFETY_DEFAULTS.maxSignalRateHz);
    expect(res.adjusted.length).toBe(3);
    expect(res.adjusted.every((a) => a.reason === "numeric_upper")).toBe(true);
  });

  it("收紧生效：数值上限取更小", () => {
    const res = mergeSafetyDefaults(cfg({ maxMoveSpeed: 0.5, maxSignalRateHz: 5 }));
    expect(res.merged.maxMoveSpeed).toBe(0.5);
    expect(res.merged.maxSignalRateHz).toBe(5);
    expect(res.adjusted).toHaveLength(2);
    expect(res.adjusted[0]!.actual).toBe(0.5);
  });

  it("worldBounds 取交集（下界取大、上界取小）", () => {
    const res = mergeSafetyDefaults(
      cfg({
        worldBounds: { x: [-10, 60], y: [-5, 30], z: [-100, 0] },
      }),
    );
    expect(res.merged.worldBounds.x).toEqual([-10, 50]);
    expect(res.merged.worldBounds.y).toEqual([0, 20]);
    expect(res.merged.worldBounds.z).toEqual([-50, 0]);
    expect(res.adjusted).toHaveLength(3);
    expect(res.adjusted.every((a) => a.reason === "bounds_intersect")).toBe(true);
  });

  it("相等值不记录 adjusted", () => {
    const res = mergeSafetyDefaults({ maxMoveSpeed: SAFETY_DEFAULTS.maxMoveSpeed });
    expect(res.adjusted).toHaveLength(0);
  });

  it("运行期传 speechRequiresSanitize 抛 safety_field_forbidden", () => {
    expect(() => mergeSafetyDefaults({ speechRequiresSanitize: false } as never)).toThrow(
      /safety_field_forbidden/,
    );
  });

  it("speechRequiresSanitize 始终为 true（无配置路径）", () => {
    const res = mergeSafetyDefaults({});
    expect(res.merged.speechRequiresSanitize).toBe(true);
  });

  it("空交集 worldBounds：保持默认并记录（minimal; confirm）", () => {
    const res = mergeSafetyDefaults(cfg({ worldBounds: { x: [100, 200] } }));
    expect(res.merged.worldBounds.x).toEqual([...SAFETY_DEFAULTS.worldBounds.x]);
    expect(res.adjusted.length).toBe(1);
  });

  it("写入 A03 证据产物", () => {
    writeEvidenceLog("safety-merge.test", ["tighten-only + adjusted observable"], true);
  });
});
