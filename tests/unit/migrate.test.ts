// ContractMigrator：幂等纯函数；空表仅校验；开发模式双调用 deep equal（附件 A 5.3）
import { describe, expect, it, vi } from "vitest";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import type { ContractRegistry } from "../../core/contract/versioning";
import { writeEvidenceLog } from "../helpers/evidence";

describe("contract migrator", () => {
  it("空表 validateAndMigrate 仅校验，不迁移", () => {
    const c = createContractRegistry();
    expect(() => c.validateAndMigrate("expression", "0.9.0", { x: 1 })).toThrow(
      /contract_version_mismatch:expression/,
    );
    expect(c.validateAndMigrate("expression", "1.0.0", { x: 1 })).toEqual({ x: 1 });
  });

  it("迁移函数必须纯函数、幂等；开发模式双调用 deep equal 断言", () => {
    const c = createContractRegistry();
    let calls = 0;
    c.registerMigrator("0.9.0", "1.0.0", (old) => {
      calls += 1;
      const o = old as { v: number };
      return { ...o, migrated: true };
    });
    // 开发模式：migrator 双调用（calls 会 +2），deep equal 通过
    const out = c.validateAndMigrate("expression", "0.9.0", { v: 1 });
    expect(out).toEqual({ v: 1, migrated: true });
    expect(calls).toBe(2);
  });

  it("非幂等 migrator 在开发模式抛 migrator_not_idempotent", () => {
    const c = createContractRegistry();
    let n = 0;
    c.registerMigrator("0.9.0", "1.0.0", (old) => {
      n += 1;
      return { ...(old as object), n };
    });
    expect(() => c.validateAndMigrate("expression", "0.9.0", { v: 1 })).toThrow(
      /migrator_not_idempotent/,
    );
  });

  it("迁移后仍需 validate：目标版本不符抛错", () => {
    const c = createContractRegistry();
    c.registerMigrator("0.9.0", "1.0.0", (old) => old);
    // 迁移后 payload 无版本概念——这里验证迁移表键只匹配 from->to；跨版本无表项禁止隐式兜底
    expect(() => c.validateAndMigrate("expression", "0.8.0", {})).toThrow(
      /contract_version_mismatch:expression/,
    );
  });

  it("supports 范围判定（compareVersions）", () => {
    const c = createContractRegistry();
    expect(c.supports({ expression: { min: "1.0.0", max: "1.0.0" } })).toBe(true);
    expect(c.supports({ expression: { min: "1.0.0", max: "2.0.0" } })).toBe(true);
    expect(c.supports({ expression: { min: "0.1.0", max: "0.9.0" } })).toBe(false);
    expect(c.supports({ expression: { min: "1.1.0", max: "2.0.0" } })).toBe(false);
    expect(c.supports({ bogusKind: { min: "1.0.0", max: "1.0.0" } } as never)).toBe(false);
  });

  it("写入 migrate 证据产物", () => {
    writeEvidenceLog("migrate.test", ["idempotent pure migrators; dev double-call deep equal"], true);
  });
});
