// Genesis-1 角色运行时骨架 · 契约（附件 A 3.4）
export const ACTUATOR_CONTRACT_VERSION = "1.0.0";
export const TRACKING_CONTRACT_VERSION = "1.0.0";
export const SPATIAL_CONTRACT_VERSION = "1.0.0";
export const EXPRESSION_FRAME_INTENT_CONTRACT_VERSION = "1.0.0";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type EntityRef =
  | { kind: "agent"; id: string }
  | { kind: "object"; id: string }
  | { kind: "anchor"; id: string };

export interface SpatialIntent {
  contractVersion: string;
  id: string;
  kind: "move_to" | "look_at" | "face" | "jump" | "idle" | "stop";
  target?: Vec3 | EntityRef;
  speed?: number;
  priority?: number;
  timeoutMs?: number;
  resetOnFinish?: boolean;
  sourceId: string;
}

export interface ActuatorFrame {
  contractVersion: string;
  tick: number;
  ts: number;
  axes: { vertical: number; horizontal: number; lookX: number; lookY: number };
  buttons: Record<string, boolean>;
  parameters: Record<string, number | boolean>;
}

export interface TrackingFrame {
  contractVersion: string;
  ts: number;
  source: string;
  bones: Record<string, { rotation: Quat; position?: Vec3 }>;
  confidence?: number;
}

export interface ExpressionFrameIntent {
  contractVersion: string;
  id: string;
  signalId: string;
  target: { parameters: Record<string, number>; timeoutMs?: number };
}
