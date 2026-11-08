// Genesis-1 角色运行时骨架 · 契约（附件 A 3.7）
import type { ActuatorFrame, SpatialIntent } from "./spatial";
import type { SanitizedText, SpeechPayload } from "./speech";
import type { Principal, ToolDefinition } from "./tool";

export const SAFETY_DEFAULTS = {
  maxMoveSpeed: 2.0,
  maxJumpHeight: 0.5,
  worldBounds: { x: [-50, 50], y: [0, 20], z: [-50, 50] },
  maxSignalRateHz: 30,
  speechRequiresSanitize: true,
} as const;

export type SafetyDefaults = typeof SAFETY_DEFAULTS;

export interface SafetyEnforcer {
  enforceSpatialIntent(intent: SpatialIntent): SpatialIntent;
  enforceActuatorFrame(frame: ActuatorFrame): ActuatorFrame;
  enforceSpeech(payload: SpeechPayload): SpeechPayload | null;
  sanitize(text: string): SanitizedText;
  enforceSignalRate(sourceId: string, now: number): boolean;
  checkToolPermission(principal: Principal, def: ToolDefinition): boolean;
}
