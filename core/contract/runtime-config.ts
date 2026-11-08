// Genesis-1 角色运行时骨架 · 契约（附件 A 3.5）
import type { EventBus } from "./bus";
import type { Renderer } from "./renderer";
import type { ParameterDef } from "./parameter";
import type { ArbiterConfig } from "./arbitration";
import type { CognitionOutputAggregator } from "./aggregator";
import type { PipelineHook } from "./pipeline-hook";
import type { ContractMigratorEntry } from "./versioning";
import type { JSONSchemaValidator, ToolDefinition, ToolHandler } from "./tool";
import type { MemoryStore } from "./memory";
import type { Cognition } from "./cognition";
import type { SafetyDefaults } from "./safety";

/** SafetyConfig 类型排除 speechRequiresSanitize；传入即类型报错（P1-3 / D40） */
export type SafetyConfig = Omit<Partial<SafetyDefaults>, "speechRequiresSanitize">;

export interface DevOnlyConfig {
  allowUnsanitizedSpeech?: boolean;
}

export interface RuntimeConfig {
  runtimeId: string;
  personaId: string;
  frameHz: number;
  sharedBus?: EventBus;
  renderers: Renderer[];
  parameters: ParameterDef[];
  safety?: SafetyConfig;
  arbiter?: ArbiterConfig;
  aggregator?: CognitionOutputAggregator;
  hooks?: PipelineHook[];
  migrators?: ContractMigratorEntry[];
  schemaValidator?: JSONSchemaValidator;
  devOnly?: DevOnlyConfig;
  tools?: Array<{ def: ToolDefinition; handler: ToolHandler }>;
  memory?: MemoryStore;
  cognition?: Cognition;
  memoryRecallTimeoutMs?: number;
  maxBatchOutputs?: number;
  batchTimeoutMs?: number;
}
