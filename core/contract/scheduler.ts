// Genesis-1 角色运行时骨架 · 契约（附件 A 3.4）
import type { ActuatorFrame, ExpressionFrameIntent, SpatialIntent, TrackingFrame } from "./spatial";
import type { FrameChannel } from "./frame-channel";

export const SCHEDULER_CONTRACT_VERSION = "1.0.0";

export interface TrackingSource {
  readonly id: string;
  /** = TRACKING_CONTRACT_VERSION */
  readonly contractVersion: string;
  readonly channel: FrameChannel<TrackingFrame>;
}

export interface FusionStage {
  readonly id: string;
  process(tracking: TrackingFrame | undefined, tick: number, ts: number): void;
}

export interface Scheduler {
  /** 注册期一次性校验版本，内部调 validateAt("L35.attachTrackingSource") */
  attachTrackingSource(source: TrackingSource): void;
  setFusionStage(stage: FusionStage): void;
  /** 内部调 validateAt("Scheduler.submit") */
  submit(intent: SpatialIntent): void;
  /** 内部调 validateAt("Scheduler.submitExpression") */
  submitExpression(intent: ExpressionFrameIntent): void;
  /** 内部按 sampleFirstFrameOnly 采样校验 "L35.emitFrame"（由 composition 的 SampledValidator 完成，本方法不直接校验） */
  onFrame(cb: (frame: ActuatorFrame) => void): () => void;
  dispose(): void;
}
