// Genesis-1 角色运行时骨架 · 契约（附件 A 3.3）
export const FEEDBACK_CONTRACT_VERSION = "1.0.0";

interface FeedbackBase {
  contractVersion: string;
  ts: number;
  runtimeId: string;
  /** renderer.id */
  sourceId: string;
  /** signal 关联型填；renderer 故障不填 */
  signalId?: string;
}

export type RendererFeedback =
  | (FeedbackBase & {
      kind: "viseme_ready";
      signalId: string;
      visemeTimeline: { timeMs: number; viseme: string }[];
    })
  | (FeedbackBase & { kind: "audio_started"; signalId: string; audioRef?: string })
  | (FeedbackBase & { kind: "audio_done"; signalId: string })
  | (FeedbackBase & { kind: "interrupted"; signalId: string })
  | (FeedbackBase & { kind: "signal_error"; signalId: string; error: string })
  | (FeedbackBase & { kind: "renderer_error"; error: string });

// minimal per handbook; confirm —— 手册 3.3 未给出 FeedbackChannel 契约正文，
// 由 RendererContext.feedback 与 compose 的 feedback.subscribe 反推最小接口。
export interface FeedbackChannel {
  publish(fb: RendererFeedback): void;
  subscribe(cb: (fb: RendererFeedback) => void): () => void;
  dispose(): void;
}
