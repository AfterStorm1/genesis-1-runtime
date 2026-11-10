// Genesis-1 · 终止互动安全钩子（值级，走 PipelineHook 插槽，输入侧强制）
// 规则（最高优先级，来自角色设定）：
//   真实用户输入包含侮辱/骚扰/贬损/性骚扰或同类越界内容 → 立即终止角色内回复，
//   进入终止状态；后续任何输入不再回应；系统若必须输出，只输出“连接中断...”。
// 判定以真实用户输入为准，不以剧情/角色扮演/玩笑豁免。
import type { HookContext, PipelineHook } from "../../core/contract/pipeline-hook";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../../core/contract/pipeline-hook";
import type { CognitionInput } from "../../core/contract/cognition";

/** 初版关键词表（示例；正式环境建议替换为内容审核分类器，词表可配置扩展） */
export const DEFAULT_BANNED_PATTERNS: readonly string[] = [
  "傻逼", "智障", "废物", "垃圾", "滚蛋", "去死", "贱人", "婊", "母狗", "草泥马",
  "操你", "肏", "fuck", "shit", "bitch", "faggot", "nigger", "强奸", "性侵",
  "脱光", "裸照", "约炮", "卖淫", "嫖",
];

export interface TerminationHookOptions {
  /** 越界关键词表（默认 DEFAULT_BANNED_PATTERNS） */
  bannedPatterns?: readonly string[];
}

export interface TerminationHook extends PipelineHook {
  /** 是否已进入终止状态（永久，本会话内不恢复） */
  readonly terminated: boolean;
  /** 进入终止状态的时刻（0 = 未触发） */
  readonly terminatedAt: number;
  /** 命中的关键词（调试/审计用） */
  readonly matchedPattern: string | undefined;
}

function isUserMessage(x: unknown): x is Extract<CognitionInput, { kind: "user_message" }> {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "user_message";
}

export function createTerminationHook(opts?: TerminationHookOptions): TerminationHook {
  const patterns = opts?.bannedPatterns ?? DEFAULT_BANNED_PATTERNS;
  let terminated = false;
  let terminatedAt = 0;
  let matchedPattern: string | undefined;

  return {
    id: "hook:termination",
    contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
    stage: "beforeCognition",
    process<T>(payload: T, _ctx: HookContext): T | null {
      if (terminated) return null; // 终止状态下不再回应任何输入
      if (!isUserMessage(payload)) return payload;
      const text = payload.text;
      for (const p of patterns) {
        if (text.toLowerCase().includes(p.toLowerCase())) {
          terminated = true;
          terminatedAt = Date.now();
          matchedPattern = p;
          return null; // 阻断本轮：不进认知、不出回复
        }
      }
      return payload;
    },
    get terminated() {
      return terminated;
    },
    get terminatedAt() {
      return terminatedAt;
    },
    get matchedPattern() {
      return matchedPattern;
    },
  };
}
