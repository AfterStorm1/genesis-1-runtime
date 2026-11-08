// Genesis-1 角色运行时骨架 · CapabilityLedger 实现（附件 A 5.4 / P0-4 / E-1）
// register 内部 validateAt（Q4 确认：impl 内部校验为唯一调用点）。
// 重复 owner 且 caps 变化、非 canHotReload → 拒绝。
import type { CapabilityLedger, ComponentCapabilities } from "../contract/component";
import type { ContractKind, ContractRange, ContractRegistry } from "../contract/versioning";
import { compareVersions } from "../contract/versioning";
import { validateAt } from "../contract/entry-points";

function inRange(version: string, range: ContractRange): boolean {
  return compareVersions(version, range.min) >= 0 && compareVersions(version, range.max) <= 0;
}

export function createCapabilityLedger(contract: ContractRegistry): CapabilityLedger {
  const entries = new Map<string, ComponentCapabilities & { canHotReload?: boolean }>();

  return {
    register(owner: string, caps: ComponentCapabilities & { canHotReload?: boolean }): void {
      // 唯一校验调用点（Q4）
      validateAt("CapabilityLedger.register", { cap: caps }, contract);
      const existing = entries.get(owner);
      if (existing !== undefined) {
        const changed =
          JSON.stringify(existing.contractRanges) !== JSON.stringify(caps.contractRanges) ||
          JSON.stringify(existing.requires) !== JSON.stringify(caps.requires) ||
          JSON.stringify(existing.provides) !== JSON.stringify(caps.provides);
        if (changed && caps.canHotReload !== true) {
          throw new Error(`ledger_reload_denied:${owner}`);
        }
      }
      entries.set(owner, caps);
    },
    check(caps: ComponentCapabilities): { ok: boolean; missing?: string[] } {
      const missing: string[] = [];
      for (const req of caps.requires ?? []) {
        if (!entries.has(req)) missing.push(`component:${req}`);
      }
      for (const [kind, range] of Object.entries(caps.contractRanges) as Array<[ContractKind, ContractRange]>) {
        const cur = contract.versionOf(kind);
        if (cur === undefined || !inRange(cur, range)) {
          missing.push(`contract:${kind}`);
        }
      }
      return missing.length > 0 ? { ok: false, missing } : { ok: true };
    },
    recheck(): { owner: string; missing: string[] }[] {
      const out: { owner: string; missing: string[] }[] = [];
      for (const [owner, caps] of entries) {
        const r = this.check(caps);
        if (!r.ok) out.push({ owner, missing: r.missing ?? [] });
      }
      return out;
    },
  };
}
