// Genesis-1 角色运行时骨架 · 契约（附件 A 3.9）
export type BusEventScope = "runtime" | "world";

export interface BusEvent {
  /** runtimeId:sourceId:monotonic 或 UUIDv7 */
  id: string;
  ts: number;
  type: string;
  runtimeId: string;
  sourceId: string;
  /** 默认 "runtime" */
  scope: BusEventScope;
  targetRuntimeId?: string;
  payload: unknown;
}

export interface EventBus {
  publish(e: BusEvent): void;
  subscribe(filter: (e: BusEvent) => boolean, handler: (e: BusEvent) => void): () => void;
  dispose(): void;
}
