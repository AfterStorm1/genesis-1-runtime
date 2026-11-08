// Genesis-1 角色运行时骨架 · Scheduler 实现（附件 A 3.4 / P0-3 / P1-R2 / D54 / P0-6）
// 注册期一次性校验版本；onFrame 不直接校验 L35.emitFrame（由 composition 的
// SampledValidator 完成，避免双点）；L3.5 出口 enforceActuatorFrame 逐参数 clamp。
import type { Scheduler, TrackingSource, FusionStage } from "../contract/scheduler";
import type { ActuatorFrame, ExpressionFrameIntent, SpatialIntent, TrackingFrame } from "../contract/spatial";
import { ACTUATOR_CONTRACT_VERSION } from "../contract/spatial";
import type { Clock } from "../contract/clock";
import type { ContractRegistry } from "../contract/versioning";
import type { SafetyEnforcer } from "../contract/safety";
import { validateAt } from "../contract/entry-points";
import { createFrameChannel } from "./frame-channel-impl";

export function createScheduler(clock: Clock, safety: SafetyEnforcer, contract: ContractRegistry): Scheduler {
  const actuatorChannel = createFrameChannel<ActuatorFrame>();
  const trackingSubs = new Set<() => void>();
  let latestTracking: TrackingFrame | undefined;
  let fusion: FusionStage | undefined;
  let pendingSpatial: SpatialIntent | undefined;
  let pendingExpr: { intent: ExpressionFrameIntent; expiresAt: number } | undefined;

  // 帧循环：骨架行为（偏差清单已记录）——手册未指定帧循环启动方；
  // 此处由 attachTrackingSource 触发 clock.frameSource.start()，dispose 由
  // composition dispose 链的 clock 步（frameSource.stop 清空监听）兜底。
  const unsubClock = clock.frameSource.onTick((tick, ts) => {
    fusion?.process(latestTracking, tick, ts);
    const parameters: Record<string, number> = {};
    if (pendingExpr !== undefined) {
      if (ts < pendingExpr.expiresAt) {
        Object.assign(parameters, pendingExpr.intent.target.parameters);
      } else {
        pendingExpr = undefined;
      }
    }
    void pendingSpatial; // 空间意图的最小运动学映射不在骨架范围（见 docs/def/deviations.md）
    const raw: ActuatorFrame = {
      contractVersion: ACTUATOR_CONTRACT_VERSION,
      tick,
      ts,
      axes: { vertical: 0, horizontal: 0, lookX: 0, lookY: 0 },
      buttons: {},
      parameters,
    };
    // L3.5 出口强制点：逐参数 clamp，未注册项丢弃（铁律 5）
    const frame = safety.enforceActuatorFrame(raw);
    actuatorChannel.publish(frame);
  });

  return {
    attachTrackingSource(source: TrackingSource): void {
      // 注册期一次性校验（唯一调用点；Q4 确认 impl 内部校验）
      validateAt("L35.attachTrackingSource", { source }, contract);
      const unsub = source.channel.subscribe(
        (f) => {
          latestTracking = f;
        },
        { dropIfBusy: true },
      );
      trackingSubs.add(unsub);
      clock.frameSource.start(); // 骨架行为：有体感源即启动帧循环
    },
    setFusionStage(stage: FusionStage): void {
      fusion = stage;
    },
    submit(intent: SpatialIntent): void {
      validateAt("Scheduler.submit", { intent }, contract);
      pendingSpatial = safety.enforceSpatialIntent(intent);
    },
    submitExpression(intent: ExpressionFrameIntent): void {
      validateAt("Scheduler.submitExpression", { intent }, contract);
      const timeoutMs = intent.target.timeoutMs;
      pendingExpr = {
        intent,
        expiresAt: timeoutMs !== undefined ? clock.now() + timeoutMs : Number.POSITIVE_INFINITY,
      };
    },
    onFrame(cb: (frame: ActuatorFrame) => void): () => void {
      return actuatorChannel.subscribe(cb);
    },
    dispose(): void {
      unsubClock();
      for (const unsub of trackingSubs) unsub();
      trackingSubs.clear();
    },
  };
}
