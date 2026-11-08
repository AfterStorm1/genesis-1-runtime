// Genesis-1 角色运行时骨架 · 契约（附件 A 3.8）
import type { EmotionIntent, VAD } from "./emotion";
import type { EntityRef } from "./spatial";
import type { SpeechPayload } from "./speech";
import type { RendererFeedback } from "./feedback";
import type { ToolInvocation } from "./tool";
import type { DriveIntent } from "./drive";
import type { PersonaCardV3 } from "./persona";
import type { WorldSnapshot } from "./perception";
import type { RecallResult } from "./memory";
import type { Clock } from "./clock";
import type { Logger } from "./pipeline-hook";

export const COGNITION_CONTRACT_VERSION = "1.0.0";

export type CognitionInput = { contractVersion: string } & (
  | { kind: "user_message"; text: string; persona: PersonaCardV3; recall?: RecallResult }
  | { kind: "perception"; snapshot: WorldSnapshot; persona: PersonaCardV3; recall?: RecallResult }
  | { kind: "drive_intent"; intent: DriveIntent; persona: PersonaCardV3; recall?: RecallResult }
  | { kind: "feedback"; feedback: RendererFeedback; persona: PersonaCardV3; recall?: RecallResult }
);

export type CognitionOutput = { contractVersion: string } & (
  | { kind: "emotion"; intent: EmotionIntent; vad?: VAD; motionKey?: string; targetRef?: EntityRef }
  | { kind: "speech"; speech: SpeechPayload; emotion?: EmotionIntent }
  | { kind: "tool_call"; invocation: ToolInvocation }
  | { kind: "state_update"; patch: Record<string, unknown> }
);

// minimal per handbook; confirm —— 手册未给 CognitionContext 正文；最小挂载上下文
export interface CognitionContext {
  contractVersion: string;
  clock: Clock;
  logger: Logger;
}

export interface Cognition {
  readonly id: string;
  mount(ctx: CognitionContext): Promise<void>;
  onInput(input: CognitionInput): AsyncIterable<CognitionOutput> | Promise<CognitionOutput>;
  dispose(): void;
}
