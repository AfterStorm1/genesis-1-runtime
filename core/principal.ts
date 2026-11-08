// Genesis-1 角色运行时骨架 · principal（附件 A 3.5 / D29）
import type { Principal } from "./contract/tool";

const cache = new Map<string, Principal>();

/**
 * 缓存 key 必须含 (kind, runtimeId, personaId) 三元组（铁律 20 / D29）。
 * 多 Runtime / 多角色隔离由 Principal.runtimeId + Principal.personaId 强制。
 */
export function derivePrincipal(
  kind: Principal["kind"],
  runtimeId: string,
  personaId: string,
): Principal {
  const key = [kind, runtimeId, personaId].join("\u0000");
  const hit = cache.get(key);
  if (hit) return hit;
  const principal: Principal = {
    id: `${kind}:${runtimeId}:${personaId}`,
    kind,
    runtimeId,
    personaId,
    grants: [],
    scopes: [],
  };
  cache.set(key, principal);
  return principal;
}

/** 测试观察用 */
export function __principalCacheSize(): number {
  return cache.size;
}
