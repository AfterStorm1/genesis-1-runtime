// Genesis-1 角色运行时骨架 · 契约（附件 A 3.2）
import type { ExpressionSignal } from "./expression";

export type ReleaseReason =
  | "completed"
  | "timeout"
  | "cancelled"
  | "interrupted"
  | "superseded"
  | "feedback_done"
  | "feedback_error"
  | "rate_limited"
  | "watchdog";

export interface ArbiterConfig {
  /** 默认 30_000 */
  defaultMaxHoldMs: number;
  maxHoldMsByChannel?: Record<string, number>;
  watchdogIntervalMs?: number;
}

export interface Arbiter {
  submit(signal: ExpressionSignal): void;
  cancel(signalId: string): void;
  notifyRelease(signalId: string, reason: ReleaseReason): void;
  onDispatch(cb: (signal: ExpressionSignal) => void): () => void;
  onRelease(cb: (signalId: string, reason: ReleaseReason) => void): () => void;
  setStrategy(strategy: ArbitrationStrategy): void;
  /** 只读快照，用于聚合与编排 */
  activeSignals(): ReadonlyArray<ExpressionSignal>;
  /** 只读快照：浅只读，防止调用方改写 strategy 引用 */
  strategy(): Readonly<ArbitrationStrategy>;
  /** 同步：返回前已完成所有 active signal 的 onRelease（reason="cancelled"） */
  dispose(): void;
}

export interface ArbitrationStrategy {
  channelOf(signal: ExpressionSignal): string | string[];
  shouldInterrupt(current: ExpressionSignal, incoming: ExpressionSignal): boolean;
  isReleasable(signal: ExpressionSignal, reason: ReleaseReason): boolean;
}
