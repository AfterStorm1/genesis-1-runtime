// Genesis-1 · 情绪偏向钩子（值级，PipelineHook beforeCognition）
// 把情绪状态机的当前状态以「系统注记」形式注入用户消息，让 LLM 回复贴合当前情绪。
import type { HookContext, PipelineHook } from "../../core/contract/pipeline-hook";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../../core/contract/pipeline-hook";
import type { EmotionStateMachine } from "./emotion-state-machine";

export interface EmotionBiasHookOptions {
  /** 注记中的角色称谓，默认“角色” */
  label?: string;
}

export function createEmotionBiasHook(
  machine: EmotionStateMachine,
  opts?: EmotionBiasHookOptions,
): PipelineHook {
  const label = opts?.label ?? "角色";
  return {
    id: "hook:emotion-bias",
    contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
    stage: "beforeCognition",
    process<T>(payload: T, _ctx: HookContext): T | null {
      if (typeof payload !== "object" || payload === null) return payload;
      const p = payload as { kind?: unknown; text?: unknown };
      if (p.kind !== "user_message" || typeof p.text !== "string") return payload;
      const s = machine.state();
      const note = `（系统注记：${label}当前情绪 ${s.emotion}，强度 ${s.intensity.toFixed(2)}）`;
      return { ...payload, text: `${note}\n${p.text}` } as T;
    },
  };
}
