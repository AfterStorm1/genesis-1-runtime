// Genesis-1 角色运行时骨架 · 契约（附件 A 3.4 / 3.9）
//
// 说明（偏差清单已记录）：
// 手册把 isSanitizedText 声明在契约文件 speech.ts，并要求「WeakSet miss → 返回 false」的
// 严格语义（S-06 / D43）。WeakSet 是 brand 语义的一部分（跨 realm / 伪造对象必须拒绝），
// 因此该函数与运行时 brand 符号、markSanitized 一并落在此契约文件，作为
// 「类型即契约」的受控实现；其余契约文件不放实现。
import type { ReleaseReason } from "./arbitration";
import type { RendererFeedback } from "./feedback";

declare const SANITIZED_TEXT_BRAND: unique symbol;

export interface SanitizedText {
  readonly text: string;
  readonly [SANITIZED_TEXT_BRAND]: true;
}

/** 运行时 brand 符号：Symbol.for("genesis.sanitized") 全局注册（附件 A 3.9 规则 2） */
export const SANITIZED_TEXT_SYMBOL: symbol = Symbol.for("genesis.sanitized");

const SANITIZED_WEAKSET = new WeakSet<SanitizedText>();

/**
 * 严格模式（S-06 / D43）：
 * 对象 / text 为 string / brand 为 true / WeakSet 命中，四者全过才为真；
 * 跨 realm（JSON / structured clone）后 brand 丢失，必须重新 sanitize。
 */
export function isSanitizedText(x: unknown): x is SanitizedText {
  if (typeof x !== "object" || x === null) return false;
  const candidate = x as SanitizedText;
  if (typeof candidate.text !== "string") return false;
  if ((x as Record<symbol, unknown>)[SANITIZED_TEXT_SYMBOL] !== true) return false;
  return SANITIZED_WEAKSET.has(candidate);
}

/** 由 SafetyEnforcer.sanitize 使用：创建冻结的 brand 对象并登记 WeakSet */
export function markSanitized(text: string): SanitizedText {
  const t = Object.freeze({
    text,
    [SANITIZED_TEXT_SYMBOL]: true,
  }) as unknown as SanitizedText;
  SANITIZED_WEAKSET.add(t);
  return t;
}

export interface SpeechPayload {
  /** 仅内部调试 / 审计；L4 只读 sanitizedText.text */
  text: string;
  sanitizedText?: SanitizedText;
  style?: { rate?: number; pitch?: number; emotion?: string };
  interruptible: boolean;
}

export type SpeechState =
  | "requested"
  | "synthesizing"
  | "playing"
  | "done"
  | "interrupted"
  | "failed";

export interface SpeechSession {
  signalId: string;
  state: SpeechState;
  releaseReason?: ReleaseReason;
  visemeTimeline?: { timeMs: number; viseme: string }[];
  audioRef?: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

export interface SpeechSessionStore {
  get(signalId: string): SpeechSession | undefined;
  /** 幂等——已存在返回原 session；不存在则创建 state="requested" */
  create(signalId: string): SpeechSession;
  transition(signalId: string, to: SpeechState, patch?: Partial<SpeechSession>): void;
  casTransition(
    signalId: string,
    fromStates: SpeechState[],
    to: SpeechState,
    patch?: Partial<SpeechSession>,
  ): boolean;
  /** 同步 */
  onFeedback(fb: RendererFeedback): void;
  /** 同步 */
  onRelease(signalId: string, reason: ReleaseReason): void;
  dispose(): void;
}
