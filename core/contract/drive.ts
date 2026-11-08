// Genesis-1 角色运行时骨架 · 契约（附件 A 3.5）
export type RuntimeMode = "reactive" | "autonomous" | "paused";

/** 离线自主生活接口预留：骨架只留接口，不实现真实自主逻辑 */
export interface InternalDrive {
  readonly id: string;
  tick(now: number): Promise<DriveIntent | null>;
  setMode(mode: RuntimeMode): void;
  snapshot?(): DriveState;
}

export interface DriveState {
  mode: RuntimeMode;
  lastIntent?: DriveIntent;
  lastTickAt?: number;
}

export interface DriveIntent {
  kind: "idle_action" | "self_talk" | "goal";
  payload: unknown;
  priority: number;
}
