// Genesis-1 角色运行时骨架 · MockSpeechRenderer（任务书 6.3 / 附件 A 8.2）
// apply 发 audio_started / audio_done feedback；L4 只读 sanitizedText.text（D20）。
// 不实现真实 TTS。
import type { Renderer } from "../../core/contract/renderer";
import type { RendererContext } from "../../core/contract/renderer";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import type { FeedbackChannel, RendererFeedback } from "../../core/contract/feedback";
import { FEEDBACK_CONTRACT_VERSION } from "../../core/contract/feedback";
import type { Clock } from "../../core/contract/clock";

export interface MockSpeechRenderer extends Renderer {
  readonly applied: ExpressionSignal[];
  /** 测试/演示：向 ctx.feedback 发送任意 feedback（适配器级扩展，非契约字段） */
  emitFeedback(fb: RendererFeedback): void;
}

export interface MockSpeechRendererOptions {
  id?: string;
  /** apply 时回调（e2e 断言 G-02：此刻 session 应为 requested） */
  onApply?: (signal: ExpressionSignal) => void;
  /** audio_done 延迟；默认 0（立即完成）；e2e 用 10 让 playing 状态可观察 */
  doneDelayMs?: number;
}

export function createMockSpeechRenderer(opts?: MockSpeechRendererOptions): MockSpeechRenderer {
  const id = opts?.id ?? "renderer:speech";
  let feedback: FeedbackChannel | undefined;
  let clock: Clock | undefined;
  const applied: ExpressionSignal[] = [];

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
      // L4 只读 sanitizedText.text（D20 / 铁律 19）
      const text = signal.speech.sanitizedText?.text;
      if (text === undefined) return; // 无脱敏文本不发声
      void text;
      opts?.onApply?.(signal);
      const base = {
        contractVersion: FEEDBACK_CONTRACT_VERSION,
        ts: clock?.now() ?? Date.now(),
        runtimeId: signal.runtimeId,
        sourceId: id,
      };
      feedback?.publish({ ...base, kind: "audio_started", signalId: signal.id });
      const finish = (): void => {
        feedback?.publish({
          ...base,
          ts: clock?.now() ?? Date.now(),
          kind: "audio_done",
          signalId: signal.id,
        });
      };
      if (opts?.doneDelayMs !== undefined) {
        setTimeout(finish, opts.doneDelayMs);
      } else {
        finish();
      }
    },
    emitFeedback(fb: RendererFeedback): void {
      feedback?.publish(fb);
    },
    dispose(): void {
      // 最小实现：无资源
    },
  };
}
