// 全局唯一 id（铁律 12 / D28）与注册表（motion / parameter）
import { describe, expect, it } from "vitest";
import { createIdFactory, createUuidV7, isValidGlobalId } from "../../core/id-factory";
import { createMotionRegistry } from "../../core/motion/motion-registry-impl";
import { createParameterRegistry } from "../../core/parameter/parameter-registry-impl";
import { writeEvidenceLog } from "../helpers/evidence";

describe("id factory", () => {
  it("runtimeId:sourceId:monotonic 递增且合法", () => {
    const f = createIdFactory("rt:a", "l3");
    const a = f.next();
    const b = f.next();
    expect(a).toBe("rt:a:l3:1");
    expect(b).toBe("rt:a:l3:2");
    expect(isValidGlobalId(a)).toBe(true);
  });

  it("UUIDv7 格式合法", () => {
    for (let i = 0; i < 20; i++) {
      const u = createUuidV7();
      expect(isValidGlobalId(u)).toBe(true);
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it("拒绝非法 id（时间戳+随机数 / 空 / 缺单调段）", () => {
    expect(isValidGlobalId("1234567890-xyz")).toBe(false);
    expect(isValidGlobalId("")).toBe(false);
    expect(isValidGlobalId("rt:a")).toBe(false);
    expect(isValidGlobalId("rt:a:notanumber")).toBe(false);
    expect(isValidGlobalId("rt:a:0")).toBe(false); // monotonic 从 1 起
    expect(isValidGlobalId("rt:e2e:l3:1")).toBe(true); // runtimeId 可含冒号
    expect(isValidGlobalId("a:b:c:7")).toBe(true);
  });
});

describe("motion registry", () => {
  it("register / has / resolve / list；asMotionKey 后 resolve 强校验", () => {
    const m = createMotionRegistry();
    m.register({ key: "wave", interruptible: true });
    expect(m.has("wave")).toBe(true);
    const key = m.asMotionKey("wave");
    expect(m.resolve(key)?.key).toBe("wave");
    expect(m.resolve(m.asMotionKey("ghost"))).toBeUndefined();
    expect(m.list()).toHaveLength(1);
  });
});

describe("parameter registry", () => {
  it("clamp 数字越界 / NaN；boolean 非法回退 default", () => {
    const p = createParameterRegistry();
    p.register({ contractVersion: "1.0.0", name: "Viseme", kind: "number", range: [0, 15], default: 0 });
    p.register({ contractVersion: "1.0.0", name: "Blink", kind: "boolean", default: false });
    expect(p.clamp("Viseme", 99)).toBe(15);
    expect(p.clamp("Viseme", -5)).toBe(0);
    expect(p.clamp("Viseme", Number.NaN)).toBe(0);
    expect(p.clamp("Blink", true)).toBe(true);
    // 运行期传入非 boolean 垃圾值（类型契约只允许 number|boolean，测试用断言绕过）→ 回退 default
    expect(p.clamp("Blink", "yes" as never)).toBe(false);
    expect(p.clamp("Unknown", 5)).toBe(5); // 未注册兜底原值（enforceActuatorFrame 负责丢弃）
  });

  it("写入 id/registry 证据产物", () => {
    writeEvidenceLog("id-registry.test", ["id format enforcement; motion/parameter registries"], true);
  });
});
