// Genesis-1 角色运行时骨架 · 契约（附件 A 5.4 / P0-4）
import type { ContractKind, ContractRange } from "./versioning";

export const COMPONENT_CAPABILITY_CONTRACT_VERSION = "1.0.0";

export interface ComponentCapabilities {
  /** = COMPONENT_CAPABILITY_CONTRACT_VERSION */
  contractVersion: string;
  contractRanges: Partial<Record<ContractKind, ContractRange>>;
  requires?: string[];
  provides?: string[];
}

export interface CapabilityLedger {
  register(owner: string, caps: ComponentCapabilities & { canHotReload?: boolean }): void;
  check(caps: ComponentCapabilities): { ok: boolean; missing?: string[] };
  recheck(): { owner: string; missing: string[] }[];
}
