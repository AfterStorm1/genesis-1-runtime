// Genesis-1 角色运行时骨架 · 默认 FusionStage（附件 A 3.4 / P1-R2）
// 最小实现（偏差清单已记录）：不做运动学融合；帧的 parameters 由
// ExpressionFrameIntent 目标直接进入 ActuatorFrame（经 enforceActuatorFrame clamp）。
import type { FusionStage } from "../../core/contract/scheduler";

export function createDefaultFusionStage(): FusionStage {
  return {
    id: "fusion:default",
    process(): void {
      // 骨架最小实现：无行为
    },
  };
}
