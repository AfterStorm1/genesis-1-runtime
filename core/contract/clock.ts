// Genesis-1 角色运行时骨架 · 契约（附件 A 3.5）
export interface Clock {
  now(): number;
  frameSource: FrameSource;
}

export interface FrameSource {
  readonly hz: number;
  onTick(cb: (tick: number, ts: number) => void): () => void;
  start(): void;
  stop(): void;
}
