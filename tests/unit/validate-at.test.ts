// A17：validateAt payload 形状 + mode 分派（附件 A 8.1）
import { describe, expect, it } from "vitest";
import {
  SampledValidator,
  VALIDATE_AT,
  __getValidateAtCounts,
  __resetValidateAtCounts,
  getByPath,
  validateAt,
} from "../../core/contract/entry-points";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import { writeEvidenceLog } from "../helpers/evidence";

const contract = createContractRegistry();

describe("A17 validateAt", () => {
  it("unknown entry → unknown_entry", () => {
    expect(() => validateAt("No.Such.Entry", { signal: {} }, contract)).toThrow(/unknown_entry:No\.Such\.Entry/);
  });

  it("错误形状抛 bad_actual（payload 缺 actualPath）", () => {
    expect(() => validateAt("L3.dispatch", { notSignal: {} }, contract)).toThrow(/bad_actual:L3\.dispatch/);
    expect(() => validateAt("L3.dispatch", { signal: { contractVersion: undefined } }, contract)).toThrow(
      /bad_actual:L3\.dispatch/,
    );
  });

  it('mode:"version" 走 contract.validate（版本不一致抛 mismatch）', () => {
    expect(() => validateAt("L3.dispatch", { signal: { contractVersion: "0.9.0" } }, contract)).toThrow(
      /contract_version_mismatch:expression/,
    );
  });

  it('mode:"capabilities" 走 supports()（范围不含当前版本抛 capability_unsupported）', () => {
    expect(() =>
      validateAt(
        "L4.register",
        { renderer: { capabilities: { contractRanges: { expression: { min: "0.1.0", max: "0.9.0" } } } } },
        contract,
      ),
    ).toThrow(/capability_unsupported:L4\.register/);
    // 范围包含当前版本 → 通过
    expect(() =>
      validateAt(
        "L4.register",
        {
          renderer: {
            capabilities: {
              contractRanges: { expression: { min: EXPRESSION_CONTRACT_VERSION, max: EXPRESSION_CONTRACT_VERSION } },
            },
          },
        },
        contract,
      ),
    ).not.toThrow();
  });

  it("getByPath 严格点分；中间 undefined 立即返回 undefined", () => {
    expect(getByPath({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(getByPath({ a: { b: 1 } }, "a.c")).toBeUndefined();
    expect(getByPath({ a: undefined }, "a.b.c")).toBeUndefined();
    expect(getByPath(null, "a.b")).toBeUndefined();
  });

  it("VALIDATE_AT 共 22 个入口且当前无 optional:true", () => {
    expect(Object.keys(VALIDATE_AT)).toHaveLength(22);
    for (const [entry, spec] of Object.entries(VALIDATE_AT)) {
      expect(spec.optional ?? false, entry).toBe(false);
      expect(spec.actualPath.length, entry).toBeGreaterThan(0);
      expect(["version", "capabilities"], entry).toContain(spec.mode);
    }
  });

  it("sampleFirstFrameOnly：首帧校验后跳过，版本变化重新校验，reset 清缓存", () => {
    const sampler = new SampledValidator();
    __resetValidateAtCounts();
    const frame = { contractVersion: "1.0.0" };
    sampler.validate("L35.emitFrame", { frame }, contract);
    expect(__getValidateAtCounts().get("L35.emitFrame")).toBe(1);
    sampler.validate("L35.emitFrame", { frame }, contract);
    sampler.validate("L35.emitFrame", { frame }, contract);
    expect(__getValidateAtCounts().get("L35.emitFrame")).toBe(1); // 缓存命中跳过
    // 版本变化 → 重新校验（坏版本抛 mismatch）
    expect(() => sampler.validate("L35.emitFrame", { frame: { contractVersion: "0.9.0" } }, contract)).toThrow(
      /contract_version_mismatch:actuatorFrame/,
    );
    // reset 后同版本再次校验
    sampler.reset();
    sampler.validate("L35.emitFrame", { frame }, contract);
    expect(__getValidateAtCounts().get("L35.emitFrame")).toBe(2);
  });

  it("L4.registerFrameCapability.ranges 为独立 entry（capabilities 模式）", () => {
    const spec = VALIDATE_AT["L4.registerFrameCapability.ranges"]!;
    expect(spec.mode).toBe("capabilities");
    expect(spec.actualPath).toBe("cap.contractRanges");
    const cap = {
      contractVersion: "1.0.0",
      contractRanges: { actuatorFrame: { min: "1.0.0", max: "1.0.0" } },
    };
    expect(() => validateAt("L4.registerFrameCapability.ranges", { cap }, contract)).not.toThrow();
    const specV = VALIDATE_AT["L4.registerFrameCapability"]!;
    expect(specV.mode).toBe("version");
    expect(() => validateAt("L4.registerFrameCapability", { cap }, contract)).not.toThrow();
  });

  it("写入 A17 证据产物", () => {
    writeEvidenceLog("validate-at.test", ["22 entries; payload shape; mode dispatch; sampleFirstFrameOnly"], true);
  });
});
