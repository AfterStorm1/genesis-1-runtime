// Genesis-1 角色运行时骨架 · InputBus 实现（附录 C / VALIDATE_AT InputBus.snapshot / InputBus.onDelta）
// injectDelta → validateAt("InputBus.onDelta")；injectSnapshot 只更新 current；
// snapshot() 返回前校验（附录 C）。
import type { InputBus, WorldDeltaInput, WorldSnapshotInput } from "../contract/input-bus";
import type { WorldDelta, WorldSnapshot } from "../contract/perception";
import { WORLD_DELTA_CONTRACT_VERSION, WORLD_SNAPSHOT_CONTRACT_VERSION } from "../contract/perception";
import type { ContractRegistry } from "../contract/versioning";
import { validateAt } from "../contract/entry-points";

export function createInputBus(contract: ContractRegistry): InputBus {
  let current: WorldSnapshot | undefined;
  const deltaCbs = new Set<(delta: WorldDelta) => void>();

  return {
    inject(delta: WorldDeltaInput): void {
      // 宿主/演示传入的 delta 可不带 contractVersion；实现侧按当前契约版本补齐后再校验
      const d: WorldDelta = (delta.contractVersion !== undefined ? delta : {
        ...delta,
        contractVersion: WORLD_DELTA_CONTRACT_VERSION,
      }) as WorldDelta;
      validateAt("InputBus.onDelta", { delta: d }, contract);
      for (const cb of [...deltaCbs]) {
        try {
          cb(d);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[input-bus] onDelta handler error", err);
        }
      }
    },
    injectSnapshot(snapshot: WorldSnapshotInput): void {
      // 只更新 current；不在此校验（snapshot() 返回前校验）
      current = (snapshot.contractVersion !== undefined ? snapshot : {
        ...snapshot,
        contractVersion: WORLD_SNAPSHOT_CONTRACT_VERSION,
      }) as WorldSnapshot;
    },
    snapshot(): WorldSnapshot {
      const s: WorldSnapshot = current ?? {
        contractVersion: WORLD_SNAPSHOT_CONTRACT_VERSION,
        ts: Date.now(),
        entities: [],
      };
      validateAt("InputBus.snapshot", { snapshot: s }, contract);
      return s;
    },
    onDelta(cb: (delta: WorldDelta) => void): () => void {
      deltaCbs.add(cb);
      return () => {
        deltaCbs.delete(cb);
      };
    },
    dispose(): void {
      deltaCbs.clear();
    },
  };
}
