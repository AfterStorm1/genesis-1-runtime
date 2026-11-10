// Genesis-1 · TTS 语音渲染器（值级扩展；替换 MockSpeechRenderer 的真实现）
// 完整复用 feedback 回路：
//   apply → audio_started → speaker.speak(脱敏文本) → audio_done → 会话 done + 释放
// 失败 → signal_error → 会话 failed（feedback_error）+ 释放。
// 打断：新信号到达时停止上一段朗读（v1 语义，见 deviations D-24）。
import type { Renderer } from "../../core/contract/renderer";
import type { RendererContext } from "../../core/contract/renderer";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import type { FeedbackChannel, RendererFeedback } from "../../core/contract/feedback";
import { FEEDBACK_CONTRACT_VERSION } from "../../core/contract/feedback";
import type { Clock } from "../../core/contract/clock";
import type { Speaker } from "../tts/sapi-speaker";
import { createSapiSpeaker } from "../tts/sapi-speaker";

export interface TtsSpeechRendererOptions {
  id?: string;
  /** 扬声器实现（默认 Windows SAPI） */
  speaker?: Speaker;
  /** 朗读前的状态回调（测试/演示观察用） */
  onSpeakStart?: (signal: ExpressionSignal) => void;
}

export interface TtsSpeechRenderer extends Renderer {
  readonly applied: ExpressionSignal[];
}

export function createTtsSpeechRenderer(opts?: TtsSpeechRendererOptions): TtsSpeechRenderer {
  const id = opts?.id ?? "renderer:tts";
  const speaker = opts?.speaker ?? createSapiSpeaker();
  const applied: ExpressionSignal[] = [];
  let feedback: FeedbackChannel | undefined;
  let clock: Clock | undefined;
  let currentSignalId: string | undefined;

  function publish(fb: RendererFeedback): void {
    feedback?.publish(fb);
  }

  function speakSignal(signal: ExpressionSignal): void {
    const text = signal.speech?.sanitizedText?.text; // L4 只读 sanitizedText.text（D20）
    if (text === undefined || text === "") return;
    currentSignalId = signal.id;
    opts?.onSpeakStart?.(signal);
    publish({
      contractVersion: FEEDBACK_CONTRACT_VERSION,
      ts: clock?.now() ?? Date.now(),
      runtimeId: signal.runtimeId,
      sourceId: id,
      kind: "audio_started",
      signalId: signal.id,
    });
    speaker
      .speak(text)
      .then(() => {
        if (currentSignalId === signal.id) currentSignalId = undefined;
        publish({
          contractVersion: FEEDBACK_CONTRACT_VERSION,
          ts: clock?.now() ?? Date.now(),
          runtimeId: signal.runtimeId,
          sourceId: id,
          kind: "audio_done",
          signalId: signal.id,
        });
      })
      .catch((err) => {
        if (currentSignalId === signal.id) currentSignalId = undefined;
        publish({
          contractVersion: FEEDBACK_CONTRACT_VERSION,
          ts: clock?.now() ?? Date.now(),
          runtimeId: signal.runtimeId,
          sourceId: id,
          kind: "signal_error",
          signalId: signal.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return {
    id,
    capabilities: {
      modalities: ["audio"],
      consumesFrames: false,
      supportsInterruption: true,
      requiresAudioCallback: true,
      emitsStateFeedback: true,
      contractRanges: {
        expression: { min: EXPRESSION_CONTRACT_VERSION, max: EXPRESSION_CONTRACT_VERSION },
      },
    },
    applied,
    async mount(ctx: RendererContext): Promise<void> {
      feedback = ctx.feedback;
      clock = ctx.clock;
    },
    apply(signal: ExpressionSignal): void {
      applied.push(signal);
      if (signal.speech === undefined) return;
      // 打断：新信号到达 → 停止上一段朗读（v1：简单停止，不处理旧会话）
      if (currentSignalId !== undefined && currentSignalId !== signal.id) {
        speaker.stop();
      }
      speakSignal(signal);
    },
    dispose(): void {
      speaker.stop();
      currentSignalId = undefined;
    },
  };
}
