// Genesis-1 角色运行时骨架 · EmptyTrackingSource 空壳（任务书 6.3 / 7.7）
// 可手动 publish TrackingFrame；体感最小链路：EmptyTrackingSource + Scheduler +
// FrameChannel + FusionStage + ActuatorFrame。
import type { TrackingSource } from "../../core/contract/scheduler";
import type { TrackingFrame } from "../../core/contract/spatial";
import { TRACKING_CONTRACT_VERSION } from "../../core/contract/spatial";
import { createFrameChannel } from "../../core/scheduler/frame-channel-impl";

export interface EmptyTrackingSource extends TrackingSource {
  publish(frame: TrackingFrame): void;
}

export function createEmptyTrackingSource(id = "tracking:empty"): EmptyTrackingSource {
  const channel = createFrameChannel<TrackingFrame>({ dropIfBusy: true });
  return {
    id,
    contractVersion: TRACKING_CONTRACT_VERSION,
    channel,
    publish(frame: TrackingFrame): void {
      channel.publish(frame);
    },
  };
}
