// Genesis-1 · 情绪状态机（轻量 InternalDrive 实现，值级）
// 把契约预留的 InternalDrive 用起来：
//   - 状态：情绪类别 + 强度(0..1) + VAD，事件转移表驱动
//   - 衰减：强度随时间向基线回落（decayPerMinute）
//   - 自主：|强度-基线| ≥ 阈值且过冷却 → tick 产出 DriveIntent(self_talk)
//   - 分类：classifyEmotionEvent 把用户文本映射为情绪事件（关键词表，可替换分类器）
import type { DriveIntent, DriveState, InternalDrive, RuntimeMode } from "../../core/contract/drive";

export type EmotionName = "happy" | "sad" | "angry" | "neutral" | "surprised" | "calm";

export interface EmotionState {
  emotion: EmotionName;
  /** 0..1 */
  intensity: number;
  /** -1..1 */
  valence: number;
  /** 0..1 */
  arousal: number;
  /** 0..1 */
  dominance: number;
  /** 基线强度（衰减目标） */
  baselineIntensity: number;
  updatedAt: number;
}

export interface EmotionEvent {
  type: "praise" | "criticism" | "comfort" | "bonding" | "stress" | "neutral";
  /** 0..1，默认 0.5 */
  magnitude?: number;
}

const VALENCE_BY_EMOTION: Record<EmotionName, number> = {
  happy: 0.7,
  calm: 0.25,
  neutral: 0,
  surprised: 0.1,
  sad: -0.5,
  angry: -0.6,
};

const DOMINANCE_BY_EMOTION: Record<EmotionName, number> = {
  angry: 0.4,
  calm: 0.2,
  happy: 0.1,
  neutral: 0,
  surprised: 0,
  sad: 0,
};

interface TransitionRule {
  emotion?: EmotionName;
  intensityDelta?: number;
  valenceDelta?: number;
}

/** 事件转移表（轻量线性规则；可整体替换为 LLM/分类器输出） */
const TRANSITIONS: Record<EmotionEvent["type"], TransitionRule> = {
  praise: { emotion: "happy", intensityDelta: 0.25, valenceDelta: 0.15 },
  criticism: { emotion: "sad", intensityDelta: 0.2, valenceDelta: -0.15 },
  comfort: { emotion: "calm", intensityDelta: -0.2, valenceDelta: 0.05 },
  bonding: { emotion: "calm", intensityDelta: 0.12, valenceDelta: 0.15 },
  stress: { emotion: "sad", intensityDelta: 0.3, valenceDelta: -0.2 },
  neutral: { intensityDelta: -0.02 },
};

/** 输入文本 → 情绪事件（关键词表初版） */
export function classifyEmotionEvent(text: string): EmotionEvent {
  if (/难过|伤心|哭|低落|委屈|失恋/.test(text)) return { type: "comfort", magnitude: 0.6 };
  if (/抱|牵手|靠近|想你了|喜欢你|陪我|亲/.test(text)) return { type: "bonding", magnitude: 0.6 };
  if (/夸|厉害|好棒|真棒|喜欢|太强|谢谢|好看|聪明|佩服|不错/.test(text)) {
    return { type: "praise", magnitude: 0.5 };
  }
  if (/压力|加班|赶|催|急|好累/.test(text)) return { type: "stress", magnitude: 0.6 };
  if (/不行|错了|讨厌|烦|失望|糟糕|有病/.test(text)) return { type: "criticism", magnitude: 0.6 };
  return { type: "neutral", magnitude: 0.1 };
}

export interface EmotionStateMachineOptions {
  /** 基线（情绪回落目标），默认 calm / 0.3 */
  baseline?: { emotion: EmotionName; intensity: number };
  /** 每分钟向基线衰减量，默认 0.02 */
  decayPerMinute?: number;
  /** 自主说话阈值：|强度-基线| ≥ 此值才产出 DriveIntent，默认 0.3 */
  selfTalkThreshold?: number;
  /** 自主说话冷却，默认 90_000ms */
  cooldownMs?: number;
  /** 时钟注入（测试用） */
  now?: () => number;
}

export interface EmotionStateMachine extends InternalDrive {
  /** 当前状态快照 */
  state(): EmotionState;
  /** 必选化（InternalDrive 中为可选） */
  snapshot(): DriveState;
  /** 施加一个情绪事件，返回新状态 */
  applyEvent(ev: EmotionEvent, now?: number): EmotionState;
  /** 分析文本并施加对应情绪事件 */
  applyText(text: string): EmotionEvent;
  /** 最近一次产出的 DriveIntent（无则 null） */
  lastIntent(): DriveIntent | null;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function clampN1P1(x: number): number {
  return Math.min(1, Math.max(-1, x));
}

export function createEmotionStateMachine(opts?: EmotionStateMachineOptions): EmotionStateMachine {
  const baseline = opts?.baseline ?? { emotion: "calm", intensity: 0.3 };
  const decayPerMinute = opts?.decayPerMinute ?? 0.02;
  const selfTalkThreshold = opts?.selfTalkThreshold ?? 0.3;
  const cooldownMs = opts?.cooldownMs ?? 90_000;
  const nowFn = opts?.now ?? ((): number => Date.now());

  let mode: RuntimeMode = "reactive";
  let lastTickAt: number | undefined;
  let lastIntentAt = -Infinity;
  let last: DriveIntent | null = null;

  const st: EmotionState = {
    emotion: baseline.emotion,
    intensity: baseline.intensity,
    valence: VALENCE_BY_EMOTION[baseline.emotion],
    arousal: baseline.intensity,
    dominance: DOMINANCE_BY_EMOTION[baseline.emotion],
    baselineIntensity: baseline.intensity,
    updatedAt: nowFn(),
  };

  function snapshot(): EmotionState {
    return { ...st };
  }

  return {
    id: "drive:emotion",
    state: snapshot,
    applyEvent(ev, now = nowFn()) {
      const rule = TRANSITIONS[ev.type];
      const mag = clamp01(ev.magnitude ?? 0.5);
      if (rule.emotion !== undefined && rule.emotion !== st.emotion) {
        // 情绪类别切换：重置到起步强度再叠加
        st.emotion = rule.emotion;
        st.intensity = 0.3;
        st.valence = VALENCE_BY_EMOTION[rule.emotion];
        st.dominance = DOMINANCE_BY_EMOTION[rule.emotion];
      }
      st.intensity = clamp01(st.intensity + (rule.intensityDelta ?? 0) * mag);
      st.valence = clampN1P1(st.valence + (rule.valenceDelta ?? 0) * mag);
      st.arousal = clamp01(st.intensity);
      st.updatedAt = now;
      return snapshot();
    },
    applyText(text) {
      const ev = classifyEmotionEvent(text);
      this.applyEvent(ev);
      return ev;
    },
    async tick(now = nowFn()): Promise<DriveIntent | null> {
      // 1. 时间衰减：向基线回落
      const minutes = Math.max(0, (now - st.updatedAt) / 60_000);
      const decay = decayPerMinute * minutes;
      if (decay > 0) {
        if (st.intensity > baseline.intensity) {
          st.intensity = Math.max(baseline.intensity, st.intensity - decay);
        } else if (st.intensity < baseline.intensity) {
          st.intensity = Math.min(baseline.intensity, st.intensity + decay);
        }
        st.arousal = clamp01(st.intensity);
        st.updatedAt = now;
      }
      // 回落到位 → 情绪回基线类别
      if (Math.abs(st.intensity - baseline.intensity) < 0.02) {
        st.emotion = baseline.emotion;
        st.valence = VALENCE_BY_EMOTION[baseline.emotion];
        st.dominance = DOMINANCE_BY_EMOTION[baseline.emotion];
      }
      lastTickAt = now;
      // 2. 自主说话判定
      const deviation = Math.abs(st.intensity - baseline.intensity);
      if (deviation >= selfTalkThreshold && now - lastIntentAt >= cooldownMs) {
        lastIntentAt = now;
        last = {
          kind: "self_talk",
          priority: 20,
          payload: { emotion: st.emotion, intensity: st.intensity, deviation },
        };
        return last;
      }
      return null;
    },
    setMode(m: RuntimeMode) {
      mode = m;
    },
    snapshot(): DriveState {
      return { mode, lastIntent: last ?? undefined, lastTickAt };
    },
    lastIntent() {
      return last;
    },
  };
}
