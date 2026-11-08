// Genesis-1 角色运行时骨架 · runtime 门面与构建信息
import type { Pipeline } from "./pipeline";
import type { Scheduler } from "./contract/scheduler";
import type { RendererRegistry, SignalDispatcher } from "./contract/dispatch";
import type { Arbiter } from "./contract/arbitration";
import type { SpeechSessionStore } from "./contract/speech";
import type { SafetyEnforcer } from "./contract/safety";
import type { ToolRegistry } from "./contract/tool";
import type { EventBus } from "./contract/bus";
import type { ExpressionSourceHub } from "./contract/expression-source";
import type { PipelineHookChain } from "./contract/pipeline-hook";
import type { CapabilityLedger } from "./contract/component";
import type { InputBus } from "./contract/input-bus";
import type { FeedbackChannel } from "./contract/feedback";

/** compose() 返回的运行时 bundle（附件 A 4.2） */
export interface RuntimeBundle {
  pipeline: Pipeline;
  scheduler: Scheduler;
  registry: RendererRegistry;
  dispatcher: SignalDispatcher;
  arbiter: Arbiter;
  speech: SpeechSessionStore;
  safety: SafetyEnforcer;
  tools: ToolRegistry;
  bus: EventBus;
  sourceHub: ExpressionSourceHub;
  hooks: PipelineHookChain;
  ledger: CapabilityLedger;
  // 补充字段（偏差清单已记录）：手册 4.2 片段未列，但 §8.2 e2e 第 1 步要求
  // InputBus.inject 可达、A14 反馈断言需要观察 FeedbackChannel，故随 bundle 返回。
  inputBus: InputBus;
  feedback: FeedbackChannel;
  dispose(): Promise<void>;
}

/** 生产构建判定：NODE_ENV=production 或 GENESIS_BUILD=production */
export function isProductionBuild(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.GENESIS_BUILD === "production"
  );
}
