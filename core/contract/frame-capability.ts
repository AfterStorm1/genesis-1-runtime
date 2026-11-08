// Genesis-1 角色运行时骨架 · 契约（附件 A 3.3）
import type { ContractKind, ContractRange } from "./versioning";

export interface FrameCapability {
  /** renderer.id */
  id: string;
  /** = ACTUATOR_CONTRACT_VERSION */
  contractVersion: string;
  contractRanges: Partial<Record<ContractKind, ContractRange>>;
  supportedParameters?: string[];
}
