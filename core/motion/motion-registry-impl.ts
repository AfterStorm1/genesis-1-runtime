// Genesis-1 角色运行时骨架 · MotionRegistry 实现（附件 A 3.1 / D15）
import type { MotionDef, MotionKey, MotionRegistry } from "../contract/motion";

export function createMotionRegistry(): MotionRegistry {
  const defs = new Map<string, MotionDef>();

  return {
    register(def: MotionDef): void {
      defs.set(def.key, def);
    },
    has(key: string): boolean {
      return defs.has(key);
    },
    asMotionKey(key: string): MotionKey {
      // brand 为类型级约束；运行期强校验在 resolve()：aggregator 对 resolve 失败整批拒绝
      return key as MotionKey;
    },
    resolve(key: MotionKey): MotionDef | undefined {
      return defs.get(key as unknown as string);
    },
    list(): MotionDef[] {
      return [...defs.values()];
    },
  };
}
