// Genesis-1 角色运行时骨架 · 默认聚合器（附件 A 3.8 默认合并规则 1–12 / D19）
// 由 l3Tick 直接调用，不注册为 Hub source（P0-5）。
import type { AggregateContext, CognitionOutputAggregator } from "../../core/contract/aggregator";
import type { CognitionOutput } from "../../core/contract/cognition";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import { isSanitizedText } from "../../core/contract/speech";

export interface DefaultAggregator extends CognitionOutputAggregator {
  /** 测试观察：聚合期间的 degraded 记录 */
  takeDegradedLog(): string[];
}

function channelList(ch: string | string[]): string[] {
  return Array.isArray(ch) ? ch : [ch];
}

/** 规则 6：多 emotion 按 intensity 降序 →（输出数组）后出现者优先；其余记 degraded */
function pickEmotion(
  emotionOutputs: Array<Extract<CognitionOutput, { kind: "emotion" }>>,
  degraded: string[],
): Extract<CognitionOutput, { kind: "emotion" }> | undefined {
  if (emotionOutputs.length === 0) return undefined;
  let best: Extract<CognitionOutput, { kind: "emotion" }> | undefined;
  let bestIntensity = -Infinity;
  for (const out of emotionOutputs) {
    const n = Number(out.intent.intensity);
    const intensity = Number.isNaN(n) ? 0 : n;
    if (intensity >= bestIntensity) {
      bestIntensity = intensity;
      best = out; // 同 intensity 时数组后出现者胜出
    }
  }
  for (const out of emotionOutputs) {
    if (out !== best) degraded.push(`emotion_tie_break:dropped:${out.intent.emotion}`);
  }
  return best;
}

export function createDefaultAggregator(): DefaultAggregator {
  const degraded: string[] = [];

  return {
    aggregate(outputs: CognitionOutput[], ctx: AggregateContext): ExpressionSignal[] {
      if (outputs.length === 0) return []; // 规则 12：空批次
      const ts = ctx.clock.now();

      const emotionOutputs = outputs.filter((o) => o.kind === "emotion") as Array<
        Extract<CognitionOutput, { kind: "emotion" }>
      >;
      const speechOutputs = outputs.filter((o) => o.kind === "speech") as Array<
        Extract<CognitionOutput, { kind: "speech" }>
      >;
      // 规则 2：tool_call / state_update 不产 signal

      // 规则 8：sanitizedText 缺失 → 整批失败，记 degraded
      for (const s of speechOutputs) {
        if (!isSanitizedText(s.speech.sanitizedText)) {
          degraded.push("missing_sanitized_text");
          return [];
        }
      }
      // 规则 7：motionKey 非法 → 整批失败，记 degraded
      for (const e of emotionOutputs) {
        if (e.motionKey !== undefined) {
          const key = ctx.motion.asMotionKey(e.motionKey);
          if (!ctx.motion.resolve(key)) {
            degraded.push(`invalid_motion_key:${e.motionKey}`);
            return [];
          }
        }
      }
      // 多条 speech：取首条，其余记 degraded（minimal per handbook; confirm）
      if (speechOutputs.length > 1) {
        degraded.push(`multi_speech:keep_first:dropped=${speechOutputs.length - 1}`);
      }
      const speechOut = speechOutputs[0];
      const speech = speechOut?.speech;

      // 规则 3：emotion + speech 合并为单 signal；规则 4/5：仅 emotion / 仅 speech
      let emotionOut = pickEmotion(emotionOutputs, degraded);
      let emotion = emotionOut?.intent;
      let vad = emotionOut?.vad ?? { valence: 0, arousal: 0, dominance: 0 };

      if (emotion === undefined && speech !== undefined) {
        // 规则 5：仅 speech → emotion 沿用 activeSignals 中 ts 最大者；同 ts 取数组后出现者；无则 neutral
        let best: ExpressionSignal | undefined;
        let bestIdx = -1;
        for (let i = 0; i < ctx.activeSignals.length; i++) {
          const a = ctx.activeSignals[i]!;
          if (best === undefined || a.ts > best.ts || (a.ts === best.ts && i > bestIdx)) {
            best = a;
            bestIdx = i;
          }
        }
        emotion = best?.emotion ?? { emotion: "neutral", intensity: 0, contextTags: [] };
        vad = best?.vad ?? { valence: 0, arousal: 0, dominance: 0 };
      }

      if (emotion === undefined && speech === undefined) return []; // 无可聚合输出

      // 规则 9：priority = clamp(20 + intensity*60 + (speech?20:0), 0, 100)；intensity 先 clamp [0,1]
      const rawIntensity = Number(emotion?.intensity ?? 0);
      const intensity = Number.isNaN(rawIntensity) ? 0 : Math.min(1, Math.max(0, rawIntensity));
      const priority = Math.min(100, Math.max(0, 20 + intensity * 60 + (speech !== undefined ? 20 : 0)));

      const signal: ExpressionSignal = {
        contractVersion: EXPRESSION_CONTRACT_VERSION,
        id: ctx.nextId(), // 规则 11
        ts,
        emotion: emotion ?? { emotion: "neutral", intensity: 0, contextTags: [] },
        vad,
        motionKey:
          emotionOut?.motionKey !== undefined ? ctx.motion.asMotionKey(emotionOut.motionKey) : undefined,
        targetRef: emotionOut?.targetRef,
        speech,
        priority,
        // 无 speech 的 emotion-only signal 默认可中断（minimal per handbook; confirm）
        interruptible: speech !== undefined ? speech.interruptible : true,
        sourceId: ctx.sourceId,
        runtimeId: ctx.runtimeId,
      };

      // 规则 10：supersedes —— activeSignals 中 interruptible===true 且 channelOf 有交集者
      const supersedes: string[] = [];
      const myChannels = channelList(ctx.strategy.channelOf(signal));
      for (const a of ctx.activeSignals) {
        if (a.interruptible !== true) continue;
        const otherChannels = channelList(ctx.strategy.channelOf(a));
        if (myChannels.some((ch) => otherChannels.includes(ch))) {
          supersedes.push(a.id);
        }
      }
      if (supersedes.length > 0) signal.supersedes = supersedes;

      return [signal];
    },
    takeDegradedLog(): string[] {
      return degraded.splice(0, degraded.length);
    },
  };
}
