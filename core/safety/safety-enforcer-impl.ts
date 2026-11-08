// Genesis-1 角色运行时骨架 · SafetyEnforcer 实现（附件 A 3.7 / 强制点表 / D16）
import type { SafetyDefaults, SafetyEnforcer } from "../contract/safety";
import type { ParameterRegistry } from "../contract/parameter";
import type { ActuatorFrame, SpatialIntent } from "../contract/spatial";
import type { SanitizedText, SpeechPayload } from "../contract/speech";
import { isSanitizedText, markSanitized } from "../contract/speech";
import type { Principal, ToolDefinition } from "../contract/tool";

export interface SafetyEnforcerOptions {
  /**
   * dev-only 直通：仅非生产构建允许（compose 已做生产静态拒绝，见 composition-root）。
   * 不经过 mergeSafetyDefaults（P1-3 / D33 / D40）。
   */
  allowUnsanitizedSpeech?: boolean;
}

export function createSafetyEnforcer(
  defaults: SafetyDefaults,
  parameter: ParameterRegistry,
  opts?: SafetyEnforcerOptions,
): SafetyEnforcer {
  const allowUnsanitized = opts?.allowUnsanitizedSpeech === true;
  const rateState = new Map<string, number>();
  const minIntervalMs = defaults.maxSignalRateHz > 0 ? 1000 / defaults.maxSignalRateHz : 0;

  return {
    enforceSpatialIntent(intent: SpatialIntent): SpatialIntent {
      const out: SpatialIntent = { ...intent };
      if (out.speed !== undefined) {
        out.speed = Math.min(Number(out.speed), defaults.maxMoveSpeed);
      }
      if (out.kind === "jump" && out.speed !== undefined) {
        // jump 的 speed 语义按高度上限收紧（minimal；手册仅给 maxJumpHeight 未给映射）
        out.speed = Math.min(Number(out.speed), defaults.maxJumpHeight);
      }
      return out;
    },
    enforceActuatorFrame(frame: ActuatorFrame): ActuatorFrame {
      const parameters: Record<string, number | boolean> = {};
      for (const [key, value] of Object.entries(frame.parameters)) {
        if (!parameter.has(key)) continue; // 未注册项丢弃（强制点表）
        parameters[key] = parameter.clamp(key, value);
      }
      return { ...frame, parameters };
    },
    enforceSpeech(payload: SpeechPayload): SpeechPayload | null {
      // 生产构建 enforceSpeech 仍要求 sanitizedText；dev-only 直通仅非生产
      if (!isSanitizedText(payload.sanitizedText)) {
        return allowUnsanitized ? payload : null;
      }
      return payload;
    },
    sanitize(text: string): SanitizedText {
      return markSanitized(text);
    },
    enforceSignalRate(sourceId: string, now: number): boolean {
      const last = rateState.get(sourceId);
      if (last !== undefined && now - last < minIntervalMs) return false;
      rateState.set(sourceId, now);
      return true;
    },
    checkToolPermission(principal: Principal, def: ToolDefinition): boolean {
      if (!principal.grants.includes(def.permission)) return false;
      // scope 语义为字符串匹配（已知局限：手册 7.6）
      if (def.scopes.length === 0) return true;
      return def.scopes.some((s) => principal.scopes.includes(s));
    },
  };
}
