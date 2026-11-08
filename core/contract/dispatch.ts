// Genesis-1 角色运行时骨架 · 契约
// minimal per handbook; confirm —— 手册目录含 dispatch.ts 但第 3 章无正文；
// 由 SignalDispatcher（全量广播 / 异常隔离）与 RendererRegistry 装配反推最小接口。
import type { ExpressionSignal } from "./expression";
import type { ActuatorFrame } from "./spatial";
import type { Renderer } from "./renderer";
import type { FrameCapability } from "./frame-capability";

export interface SignalDispatcher {
  /** 全量广播；不读 channelOf；单 renderer try/catch；失败发 RendererFeedback{kind:"signal_error"} */
  dispatch(signal: ExpressionSignal): void;
  /** 仅派发给 consumesFrames === true 的 renderer；此路径无 validateAt（铁律 4 / A02） */
  dispatchFrame(frame: ActuatorFrame): void;
  dispose(): void;
}

export interface RendererRegistry {
  /** 成功 mount 后才 register；registry 内不做 mount（G-03） */
  register(renderer: Renderer): void;
  /** L4.registerFrameCapability(.ranges) 两次校验通过后落表（P1-R6 / D51） */
  registerFrameCapability(cap: FrameCapability): void;
  list(): Renderer[];
  dispose(): void;
}
