// Genesis-1 角色运行时骨架 · FeedbackChannel 实现（附件 A 3.3）
import type { FeedbackChannel, RendererFeedback } from "../contract/feedback";

export function createFeedbackChannel(): FeedbackChannel {
  const subs = new Set<(fb: RendererFeedback) => void>();

  return {
    publish(fb: RendererFeedback): void {
      for (const cb of [...subs]) {
        try {
          cb(fb);
        } catch (err) {
          // 异常隔离：单订阅者失败不影响其余订阅者
          // eslint-disable-next-line no-console
          console.error("[feedback-channel] handler error", err);
        }
      }
    },
    subscribe(cb: (fb: RendererFeedback) => void): () => void {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    dispose(): void {
      subs.clear();
    },
  };
}
