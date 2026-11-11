// 颜文字发射：情绪门槛 / 冷却 / 开关（值级扩展测试）
import { describe, expect, it } from "vitest";
import { HAPPY_KAOMOJI, pickKaomoji } from "../../hosts/qq-host/kaomoji";
import { writeEvidenceLog } from "../helpers/evidence";

const cfg = { enabled: true, minIntensity: 0.55, cooldownMs: 300_000 };
const rng = (): number => 0; // 固定取第一个

describe("kaomoji", () => {
  it("心情好且强度达标才发射；否则 null", () => {
    expect(pickKaomoji({ emotion: "happy", intensity: 0.7 }, 0, 1, cfg, rng)).toBe(HAPPY_KAOMOJI[0]);
    expect(pickKaomoji({ emotion: "happy", intensity: 0.4 }, 0, 1, cfg, rng)).toBeNull();
    expect(pickKaomoji({ emotion: "calm", intensity: 0.9 }, 0, 1, cfg, rng)).toBeNull();
    expect(pickKaomoji(undefined, 0, 1, cfg, rng)).toBeNull();
  });

  it("冷却内不重复发射", () => {
    expect(pickKaomoji({ emotion: "happy", intensity: 0.8 }, 100_000, 200_000, cfg, rng)).toBeNull();
    expect(pickKaomoji({ emotion: "happy", intensity: 0.8 }, 100_000, 500_000, cfg, rng)).toBe(HAPPY_KAOMOJI[0]);
  });

  it("开关关闭时永不为 null 之外的值", () => {
    expect(pickKaomoji({ emotion: "happy", intensity: 0.9 }, 0, 1, { ...cfg, enabled: false }, rng)).toBeNull();
  });

  it("写入 kaomoji 证据产物", () => {
    writeEvidenceLog("kaomoji.test", ["mood gate; cooldown; toggle"], true);
  });
});
