// Genesis-1 角色运行时骨架 · ParameterRegistry 实现（附件 A 3.9 / D21）
// 注册期版本校验由 composition 完成（VALIDATE_AT：ParameterRegistry.register 可达=composition）。
import type { ParameterDef, ParameterRegistry } from "../contract/parameter";

export function createParameterRegistry(): ParameterRegistry {
  const defs = new Map<string, ParameterDef>();

  return {
    register(def: ParameterDef): void {
      defs.set(def.name, def);
    },
    unregister(name: string): void {
      defs.delete(name);
    },
    has(name: string): boolean {
      return defs.has(name);
    },
    clamp(name: string, value: number | boolean): number | boolean {
      const def = defs.get(name);
      if (!def) return value; // 未注册项由 enforceActuatorFrame 丢弃；此处兜底原值
      if (def.kind === "boolean") {
        return typeof value === "boolean" ? value : def.default;
      }
      const n = Number(value);
      if (Number.isNaN(n)) return def.default;
      return Math.min(def.range[1], Math.max(def.range[0], n));
    },
    list(): ParameterDef[] {
      return [...defs.values()];
    },
  };
}
