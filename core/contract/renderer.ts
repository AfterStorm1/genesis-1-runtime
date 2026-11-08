// Genesis-1 角色运行时骨架 · 契约（附件 A 3.3）
import type { Clock } from "./clock";
import type { ContractKind, ContractRange, ContractRegistry } from "./versioning";
import type { FeedbackChannel } from "./feedback";
import type { EventBus } from "./bus";
import type { SafetyEnforcer } from "./safety";
import type { ActuatorFrame, EntityRef } from "./spatial";
import type { WorldEntity } from "./perception";
import type { ExpressionSignal } from "./expression";

export interface RendererCapabilities {
  modalities: Array<"text" | "visual" | "audio" | "motion" | "world">;
  consumesFrames: boolean;
  expectedFrameRate?: number;
  supportsInterruption: boolean;
  requiresAudioCallback?: boolean;
  requiresUserInput?: boolean;
  emitsStateFeedback?: boolean;
  supportedParameters?: string[];
  contractRanges: Partial<Record<ContractKind, ContractRange>>;
}

export interface Renderer {
  readonly id: string;
  readonly capabilities: RendererCapabilities;
  mount(ctx: RendererContext): Promise<void>;
  apply(signal: ExpressionSignal): void;
  applyFrame?(frame: ActuatorFrame): void;
  dispose(): void;
}

export interface RendererContext {
  clock: Clock;
  contract: ContractRegistry;
  feedback: FeedbackChannel;
  bus: EventBus;
  safety: SafetyEnforcer;
  runtimeId: string;
  sourceId: string;
  resolveTarget(ref: EntityRef): Promise<WorldEntity | null>;
}
