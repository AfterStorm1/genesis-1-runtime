// Genesis-1 角色运行时骨架 · SignalDispatcher 实现（附件 A 3.3 路由规则 / D7）
// 全量广播；不读 channelOf；单 renderer try/catch；
// 失败发 RendererFeedback{kind:"signal_error"}；dispatchFrame/applyFrame 路径无 validateAt（铁律 4 / A02）。
import type { SignalDispatcher, RendererRegistry } from "../contract/dispatch";
import type { ExpressionSignal } from "../contract/expression";
import type { ActuatorFrame } from "../contract/spatial";
import type { FeedbackChannel, RendererFeedback } from "../contract/feedback";
import { FEEDBACK_CONTRACT_VERSION } from "../contract/feedback";
import type { Clock } from "../contract/clock";

export function createSignalDispatcher(
  registry: RendererRegistry,
  feedback: FeedbackChannel,
  clock: Clock,
): SignalDispatcher {
  return {
    dispatch(signal: ExpressionSignal): void {
      for (const renderer of registry.list()) {
        try {
          renderer.apply(signal);
        } catch (error) {
          const fb: RendererFeedback = {
            contractVersion: FEEDBACK_CONTRACT_VERSION,
            ts: clock.now(),
            runtimeId: signal.runtimeId,
            sourceId: renderer.id,
            kind: "signal_error",
            signalId: signal.id,
            error: error instanceof Error ? error.message : String(error),
          };
          feedback.publish(fb); // 驱动 Arbiter release（feedback_error）
        }
      }
    },
    dispatchFrame(frame: ActuatorFrame): void {
      for (const renderer of registry.list()) {
        if (!renderer.capabilities.consumesFrames || renderer.applyFrame === undefined) continue;
        try {
          renderer.applyFrame(frame);
        } catch (error) {
          // frame 派发异常隔离：不逐帧校验（铁律 4）；仅记日志（骨架行为）
          // eslint-disable-next-line no-console
          console.error("[dispatcher] applyFrame error", renderer.id, error);
        }
      }
    },
    dispose(): void {
      // 无自有资源（registry 生命周期由 composition dispose 链管理）
    },
  };
}
