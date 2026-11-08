// Genesis-1 角色运行时骨架 · 契约
// minimal per handbook; confirm —— 手册目录含 input-bus.ts 但第 3 章无正文；
// 由附录 C（snapshot / injectDelta → InputBus.snapshot / InputBus.onDelta）反推最小接口。
import type { WorldDelta, WorldSnapshot } from "./perception";

export type WorldDeltaInput = Omit<WorldDelta, "contractVersion"> & { contractVersion?: string };
export type WorldSnapshotInput = Omit<WorldSnapshot, "contractVersion"> & { contractVersion?: string };

export interface InputBus {
  /** 内部 validateAt("InputBus.onDelta", { delta }) 后广播给 onDelta 订阅者 */
  inject(delta: WorldDeltaInput): void;
  /** 只更新 current；snapshot() 返回前校验（附录 C） */
  injectSnapshot(snapshot: WorldSnapshotInput): void;
  snapshot(): WorldSnapshot;
  onDelta(cb: (delta: WorldDelta) => void): () => void;
  dispose(): void;
}
