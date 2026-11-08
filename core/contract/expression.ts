// Genesis-1 角色运行时骨架 · 契约（附件 A 3.1）
import type { EmotionIntent, VAD } from "./emotion";
import type { MotionKey } from "./motion";
import type { EntityRef } from "./spatial";
import type { SpeechPayload } from "./speech";

export const EXPRESSION_CONTRACT_VERSION = "1.0.0";

export interface ExpressionSignal {
  contractVersion: string;
  /** runtimeId:sourceId:monotonic 或 UUIDv7（铁律 12 / D28） */
  id: string;
  ts: number;
  emotion: EmotionIntent;
  vad: VAD;
  motionKey?: MotionKey;
  targetRef?: EntityRef;
  speech?: SpeechPayload;
  durationMs?: number;
  /** 0..100；Arbiter.submit 首行强制 clamp（S-01 / D38） */
  priority: number;
  interruptible: boolean;
  supersedes?: string[];
  sourceId: string;
  runtimeId: string;
}
