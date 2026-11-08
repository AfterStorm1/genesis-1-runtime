// Genesis-1 角色运行时骨架 · 契约（附件 A 5.2）
import type { Clock } from "./clock";
import type { ContractRegistry } from "./versioning";

export const PIPELINE_HOOK_CONTRACT_VERSION = "1.0.0";

export type PipelineStage =
  | "beforeCognition"
  | "afterCognition"
  | "beforeAggregate"
  | "afterAggregate"
  | "beforeArbiter"
  | "afterArbiter";

// minimal per handbook; confirm —— 手册未给 Logger 正文；最小分级日志接口
export interface Logger {
  debug?(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/** 最小权限（D27）：只读 clock / logger / 只读契约能力；不暴露 arbiter/dispatcher/safety/tool/sourceHub/feedback */
export interface HookContext {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly contract: Readonly<Pick<ContractRegistry, "versionOf" | "supports" | "validate">>;
}

export interface PipelineHook {
  readonly id: string;
  readonly contractVersion: string;
  readonly stage: PipelineStage;
  process<T>(payload: T, ctx: HookContext): T | null | Promise<T | null>;
  dispose?(): void;
}

export interface PipelineHookChain {
  register(hook: PipelineHook): void;
  unregister(id: string): void;
  run<T>(stage: PipelineStage, payload: T): Promise<T | null>;
  list(): PipelineHook[];
  dispose(): void;
}
