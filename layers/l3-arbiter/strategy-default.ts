// Genesis-1 角色运行时骨架 · 默认仲裁策略（附件 A 3.2）
import type { ArbitrationStrategy, ReleaseReason } from "../../core/contract/arbitration";
import type { ExpressionSignal } from "../../core/contract/expression";

/** 默认策略（minimal per handbook; confirm）：speech 占 "speech" 通道，其余占 "motion" */
export const defaultStrategy: ArbitrationStrategy = {
  channelOf(signal: ExpressionSignal): string {
    return signal.speech !== undefined ? "speech" : "motion";
  },
  shouldInterrupt(current: ExpressionSignal, incoming: ExpressionSignal): boolean {
    return incoming.priority > current.priority && current.interruptible;
  },
  isReleasable(_signal: ExpressionSignal, _reason: ReleaseReason): boolean {
    return true;
  },
};
