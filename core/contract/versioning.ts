// Genesis-1 角色运行时骨架 · 契约（附件 A 3.6）
export const RUNTIME_CONTRACT_VERSION = "1.0.0";

export interface ContractKindMap {
  expression: string;
  actuatorFrame: string;
  trackingFrame: string;
  feedback: string;
  worldSnapshot: string;
  worldDelta: string;
  toolDefinition: string;
  spatialIntent: string;
  expressionFrameIntent: string;
  cognitionIn: string;
  cognitionOut: string;
  aggregator: string;
  parameter: string;
  expressionSource: string;
  pipelineHook: string;
  componentCapability: string;
}

export type ContractKind = keyof ContractKindMap;

export interface ContractRange {
  min: string;
  max: string;
}

// minimal per handbook; confirm —— 手册未给 ContractMigratorEntry 正文；
// 由 compose 的 contract.registerMigrator(m.from, m.to, m.migrate) 反推。
export interface ContractMigratorEntry {
  from: string;
  to: string;
  migrate: (old: unknown) => unknown;
}

export interface ContractRegistry {
  readonly kinds: ContractKind[];
  versionOf(kind: ContractKind): string;
  validate(kind: ContractKind, actual: string): void;
  supports(capabilityRanges: Partial<Record<ContractKind, ContractRange>>): boolean;
  registerAll(): void;
  registerMigrator(from: string, to: string, migrate: (old: unknown) => unknown): void;
  validateAndMigrate(kind: ContractKind, actual: string, payload: unknown): unknown;
}

/** 语义化版本比较（"x.y.z" 形式）；a<b → -1，a=b → 0，a>b → 1 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
