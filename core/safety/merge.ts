// Genesis-1 角色运行时骨架 · 安全 merge（附件 A 3.7 / S-03 / D40）
// 契约：数值上限取更小；下界取更大；worldBounds 取交集；布尔 true 优先；
// 每一处收紧记录进 adjusted；配置只收紧，无法放宽默认值。
import { SAFETY_DEFAULTS } from "../contract/safety";
import type { SafetyDefaults } from "../contract/safety";
import type { SafetyConfig } from "../contract/runtime-config";

export interface AdjustedEntry {
  path: string;
  requested: unknown;
  actual: unknown;
  reason: "numeric_upper" | "numeric_lower" | "bounds_intersect" | "boolean_forced";
}

export interface MergeResult {
  merged: SafetyDefaults;
  adjusted: AdjustedEntry[];
}

function tightenUpper(
  path: string,
  requested: number | undefined,
  defaultVal: number,
  adjusted: AdjustedEntry[],
): number {
  if (requested === undefined || typeof requested !== "number" || Number.isNaN(requested)) {
    return defaultVal;
  }
  const actual = Math.min(requested, defaultVal);
  // 「每处收紧记 adjusted」：只要请求值与默认值不同（无论放宽被拒绝还是收紧生效），都记录可观测
  if (requested !== defaultVal) {
    adjusted.push({ path, requested, actual, reason: "numeric_upper" });
  }
  return actual;
}

function intersectBounds(
  path: string,
  requested: readonly [number, number] | undefined,
  defaultVal: readonly [number, number],
  adjusted: AdjustedEntry[],
): [number, number] {
  if (!requested) return [defaultVal[0], defaultVal[1]];
  const lo = Math.max(defaultVal[0], requested[0]); // 下界取更大
  const hi = Math.min(defaultVal[1], requested[1]); // 上界取更小
  if (lo > hi) {
    // 空交集：手册未定义行为；保持默认并记录收紧（minimal per handbook; confirm）
    adjusted.push({
      path,
      requested: [...requested],
      actual: [...defaultVal],
      reason: "bounds_intersect",
    });
    return [defaultVal[0], defaultVal[1]];
  }
  const actual: [number, number] = [lo, hi];
  if (requested[0] !== defaultVal[0] || requested[1] !== defaultVal[1]) {
    adjusted.push({ path, requested: [...requested], actual, reason: "bounds_intersect" });
  }
  return actual;
}

export function mergeSafetyDefaults(cfg?: SafetyConfig): MergeResult {
  // 类型已排除 speechRequiresSanitize；运行期绕过类型传入 → 强制拒绝（P1-3 / D40）
  if (cfg !== undefined && "speechRequiresSanitize" in (cfg as Record<string, unknown>)) {
    throw new Error("safety_field_forbidden");
  }

  const adjusted: AdjustedEntry[] = [];
  // SAFETY_DEFAULTS 为 as const（字面量类型）；合并结果为计算值，整体断言回 SafetyDefaults
  const merged = {
    maxMoveSpeed: tightenUpper("maxMoveSpeed", cfg?.maxMoveSpeed, SAFETY_DEFAULTS.maxMoveSpeed, adjusted),
    maxJumpHeight: tightenUpper("maxJumpHeight", cfg?.maxJumpHeight, SAFETY_DEFAULTS.maxJumpHeight, adjusted),
    maxSignalRateHz: tightenUpper(
      "maxSignalRateHz",
      cfg?.maxSignalRateHz,
      SAFETY_DEFAULTS.maxSignalRateHz,
      adjusted,
    ),
    worldBounds: {
      x: intersectBounds("worldBounds.x", cfg?.worldBounds?.x, SAFETY_DEFAULTS.worldBounds.x, adjusted),
      y: intersectBounds("worldBounds.y", cfg?.worldBounds?.y, SAFETY_DEFAULTS.worldBounds.y, adjusted),
      z: intersectBounds("worldBounds.z", cfg?.worldBounds?.z, SAFETY_DEFAULTS.worldBounds.z, adjusted),
    },
    speechRequiresSanitize: SAFETY_DEFAULTS.speechRequiresSanitize, // 写死 true；无配置路径
  } as SafetyDefaults;

  return { merged, adjusted };
}
