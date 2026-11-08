// Genesis-1 角色运行时骨架 · FrameChannel 实现（附件 A 3.4 / D18 / A07）
// 放置说明（偏差清单已记录）：手册目录树未列 frame-channel 实现位置；
// 因 FrameChannel 是 L3.5 高频帧通道、唯一消费者为 Scheduler，故置于 core/scheduler/。
import type { FrameChannel } from "../contract/frame-channel";

interface Sub<T> {
  cb: (frame: T) => void;
  busy: boolean;
  drop: boolean;
}

export function createFrameChannel<T>(opts?: { dropIfBusy?: boolean }): FrameChannel<T> {
  const subs = new Set<Sub<T>>();
  let latest: T | undefined;

  return {
    publish(frame: T): void {
      latest = frame;
      for (const s of [...subs]) {
        if (s.busy && s.drop) continue; // dropIfBusy 只防重入（D18）
        s.busy = true;
        try {
          s.cb(frame);
        } catch (err) {
          // 异常隔离
          // eslint-disable-next-line no-console
          console.error("[frame-channel] subscriber error", err);
        } finally {
          s.busy = false;
        }
      }
    },
    subscribe(cb: (frame: T) => void, o?: { dropIfBusy?: boolean }): () => void {
      const sub: Sub<T> = { cb, busy: false, drop: o?.dropIfBusy ?? opts?.dropIfBusy ?? false };
      subs.add(sub);
      return () => {
        subs.delete(sub);
      };
    },
    get latest(): T | undefined {
      return latest;
    },
  };
}
