// Genesis-1 角色运行时骨架 · 契约
// minimal per handbook; confirm —— 手册未给 perception.ts / WorldSnapshot / WorldDelta /
// WorldEntity 正文；由 VALIDATE_AT（worldSnapshot / worldDelta）与 e2e 时序反推最小字段。
export const WORLD_SNAPSHOT_CONTRACT_VERSION = "1.0.0";
export const WORLD_DELTA_CONTRACT_VERSION = "1.0.0";

export interface WorldEntity {
  id: string;
  kind?: string;
  position?: { x: number; y: number; z: number };
  data?: Record<string, unknown>;
}

export interface WorldSnapshot {
  contractVersion: string;
  ts: number;
  entities: WorldEntity[];
}

export interface WorldDelta {
  contractVersion: string;
  kind: "user_message" | "perception" | "world_entity";
  text?: string;
  snapshot?: WorldSnapshot;
  entity?: WorldEntity;
  ts?: number;
}
