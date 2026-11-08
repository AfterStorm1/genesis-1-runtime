// Genesis-1 角色运行时骨架 · Clock + FrameSource 实现（附件 A 3.5）
import type { Clock, FrameSource } from "../contract/clock";

export interface ClockOptions {
  /** 测试注入用 */
  now?: () => number;
}

export function createClock(hz: number, opts?: ClockOptions): Clock {
  const nowFn = opts?.now ?? (() => Date.now());
  let tick = 0;
  let running = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const tickCbs = new Set<(tick: number, ts: number) => void>();

  function tickOnce(): void {
    tick += 1;
    const ts = nowFn();
    for (const cb of [...tickCbs]) {
      try {
        cb(tick, ts);
      } catch (err) {
        // 异常隔离
        // eslint-disable-next-line no-console
        console.error("[clock] tick handler error", err);
      }
    }
  }

  const frameSource: FrameSource = {
    hz,
    onTick(cb: (tick: number, ts: number) => void): () => void {
      tickCbs.add(cb);
      return () => {
        tickCbs.delete(cb);
      };
    },
    start(): void {
      if (running) return;
      running = true;
      interval = setInterval(tickOnce, Math.max(1, Math.floor(1000 / hz)));
    },
    stop(): void {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
      running = false;
      // 停止即清空 tick 监听：compose 的 dispose 链以 clock 步兜底 scheduler 的时钟订阅
      // （偏差清单：手册未把 scheduler.dispose 列入 dispose 链，此处由 FrameSource.stop 兜底）
      tickCbs.clear();
    },
  };

  const clock: Clock = {
    now(): number {
      return nowFn();
    },
    frameSource,
  };

  return clock;
}
