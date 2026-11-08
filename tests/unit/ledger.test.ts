// CapabilityLedger：装配；重复 owner 非 canHotReload 拒绝（附件 A 5.4 / E-1）
import { describe, expect, it } from "vitest";
import { createCapabilityLedger } from "../../core/component/capability-ledger-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { COMPONENT_CAPABILITY_CONTRACT_VERSION } from "../../core/contract/component";
import type { CapabilityLedger } from "../../core/contract/component";
import { writeEvidenceLog } from "../helpers/evidence";

const contract = createContractRegistry();

type LedgerCaps = Parameters<CapabilityLedger["register"]>[1];

function caps(overrides: Partial<LedgerCaps> = {}): LedgerCaps {
  return {
    contractVersion: COMPONENT_CAPABILITY_CONTRACT_VERSION,
    contractRanges: { expression: { min: "1.0.0", max: "1.0.0" } },
    ...overrides,
  };
}

describe("capability ledger", () => {
  it("register 内部 validateAt（坏版本拒绝）", () => {
    const ledger = createCapabilityLedger(contract);
    expect(() => ledger.register("a", caps({ contractVersion: "0.1.0" }))).toThrow(
      /contract_version_mismatch:componentCapability/,
    );
  });

  it("重复 owner：caps 相同允许；caps 变化非 canHotReload 拒绝；canHotReload:true 放行", () => {
    const ledger = createCapabilityLedger(contract);
    ledger.register("a", caps());
    ledger.register("a", caps()); // 相同 → 允许
    expect(() =>
      ledger.register("a", caps({ contractRanges: { expression: { min: "1.0.0", max: "2.0.0" } } })),
    ).toThrow(/ledger_reload_denied:a/);
    ledger.register(
      "a",
      caps({ contractRanges: { expression: { min: "1.0.0", max: "2.0.0" } }, canHotReload: true }),
    );
  });

  it("check：requires 缺失 → missing；contractRanges 不含当前版本 → missing", () => {
    const ledger = createCapabilityLedger(contract);
    ledger.register("base", caps({ provides: ["x"] }));
    const ok = ledger.check(caps({ requires: ["base"] }));
    expect(ok.ok).toBe(true);
    const bad1 = ledger.check(caps({ requires: ["ghost"] }));
    expect(bad1).toEqual({ ok: false, missing: ["component:ghost"] });
    const bad2 = ledger.check(caps({ contractRanges: { expression: { min: "0.1.0", max: "0.9.0" } } }));
    expect(bad2.ok).toBe(false);
    expect(bad2.missing).toContain("contract:expression");
  });

  it("recheck 返回所有不满足项", () => {
    const ledger = createCapabilityLedger(contract);
    ledger.register("a", caps({ requires: ["ghost"] }));
    expect(ledger.recheck()).toEqual([{ owner: "a", missing: ["component:ghost"] }]);
  });

  it("写入 ledger 证据产物", () => {
    writeEvidenceLog("ledger.test", ["hot-reload gate; requires/contract check"], true);
  });
});
