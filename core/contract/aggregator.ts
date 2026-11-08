// Genesis-1 角色运行时骨架 · 契约（附件 A 3.8）
import type { Clock } from "./clock";
import type { MotionRegistry } from "./motion";
import type { SafetyEnforcer } from "./safety";
import type { ContractRegistry } from "./versioning";
import type { ExpressionSignal } from "./expression";
import type { CognitionOutput } from "./cognition";
import type { ArbitrationStrategy } from "./arbitration";

export const AGGREGATOR_CONTRACT_VERSION = "1.0.0";

export interface AggregateContext {
  /** = AGGREGATOR_CONTRACT_VERSION */
  contractVersion: string;
  clock: Clock;
  motion: MotionRegistry;
  safety: SafetyEnforcer;
  contract: ContractRegistry;
  runtimeId: string;
  sourceId: string;
  activeSignalIds: string[];
  /** 只读，直接接收 arbiter.activeSignals() */
  activeSignals: ReadonlyArray<ExpressionSignal>;
  strategy: Pick<ArbitrationStrategy, "channelOf">;
  nextId: () => string;
}

export interface CognitionOutputAggregator {
  aggregate(outputs: CognitionOutput[], ctx: AggregateContext): ExpressionSignal[];
}
