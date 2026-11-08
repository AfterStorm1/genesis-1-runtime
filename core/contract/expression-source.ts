// Genesis-1 角色运行时骨架 · 契约（附件 A 5.1 / P0-5）
import type { ExpressionSignal } from "./expression";

export const EXPRESSION_SOURCE_CONTRACT_VERSION = "1.0.0";

export interface ExpressionSourceEmitContext {
  now: number;
  runtimeId: string;
  sourceId: string;
  activeSignals: ReadonlyArray<ExpressionSignal>;
}

export interface ExpressionSource {
  readonly id: string;
  readonly contractVersion: string;
  /** 命名统一：emit（P0-5 / D34） */
  emit(ctx: ExpressionSourceEmitContext): ExpressionSignal[];
}

export interface ExpressionSourceHub {
  register(source: ExpressionSource): void;
  unregister(id: string): void;
  flush(ctx: ExpressionSourceEmitContext): ExpressionSignal[];
  list(): ExpressionSource[];
  dispose(): void;
}
