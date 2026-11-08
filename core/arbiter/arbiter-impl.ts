// Genesis-1 角色运行时骨架 · Arbiter 实现（附件 A 3.2 / S-01 / D26 / D38 / D44 / S-07）
// submit 首行强制顺序：clampPriority → enforceSignalRate → id 格式校验。
// watchdog 多 channel 取 min；空/未知 channel 用 default 并记 degraded。
// dispose() 同步：返回前完成所有 active signal 的 onRelease(reason="cancelled")。
import type { Arbiter, ArbiterConfig, ArbitrationStrategy, ReleaseReason } from "../contract/arbitration";
import type { ExpressionSignal } from "../contract/expression";
import type { SafetyEnforcer } from "../contract/safety";
import type { Clock } from "../contract/clock";
import type { Logger } from "../contract/pipeline-hook";
import { isValidGlobalId } from "../id-factory";

export function clampPriority(priority: number): number {
  const n = Number(priority);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

interface ActiveEntry {
  signal: ExpressionSignal;
  submittedAt: number;
  maxHoldMs: number;
}

export interface ArbiterOptions {
  strategy: ArbitrationStrategy;
  config: ArbiterConfig;
  safety: SafetyEnforcer;
  clock: Clock;
  logger?: Logger;
}

export function createArbiter(opts: ArbiterOptions): Arbiter {
  const { safety, clock } = opts;
  const config: ArbiterConfig = { ...opts.config }; // defaultMaxHoldMs 为必填，compose 侧兜底 30_000
  let strategy: ArbitrationStrategy = opts.strategy;
  const active = new Map<string, ActiveEntry>();
  const dispatchCbs = new Set<(signal: ExpressionSignal) => void>();
  const releaseCbs = new Set<(signalId: string, reason: ReleaseReason) => void>();
  let disposed = false;

  const watchdog = setInterval(scanWatchdog, config.watchdogIntervalMs ?? 1000);
  if (typeof watchdog.unref === "function") watchdog.unref();

  function logDegraded(msg: string, data?: unknown): void {
    opts.logger?.warn(msg, data);
  }

  function channelsOf(signal: ExpressionSignal): string[] {
    const ch = strategy.channelOf(signal);
    return Array.isArray(ch) ? ch : [ch];
  }

  function releaseInternal(signalId: string, reason: ReleaseReason): void {
    const entry = active.get(signalId);
    if (!entry) return; // 先到先赢：已释放幂等忽略
    if (!strategy.isReleasable(entry.signal, reason)) return;
    active.delete(signalId);
    for (const cb of [...releaseCbs]) {
      try {
        cb(signalId, reason);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[arbiter] onRelease callback error", err);
      }
    }
  }

  function scanWatchdog(): void {
    const nowTs = clock.now();
    for (const [id, entry] of [...active]) {
      if (nowTs - entry.submittedAt >= entry.maxHoldMs) {
        releaseInternal(id, "watchdog");
      }
    }
  }

  return {
    submit(signal: ExpressionSignal): void {
      if (disposed) return;
      // 首行强制顺序（S-01 / D38）
      signal.priority = clampPriority(signal.priority);
      const nowTs = clock.now();
      if (!safety.enforceSignalRate(signal.sourceId, nowTs)) {
        releaseInternal(signal.id, "rate_limited"); // 尚未入 active：丢弃
        return;
      }
      if (!isValidGlobalId(signal.id)) {
        // 非法 id 拒绝并记 degraded（铁律 12）
        logDegraded("invalid_signal_id", { id: signal.id });
        return;
      }
      const channels = channelsOf(signal);
      let maxHoldMs = config.defaultMaxHoldMs;
      if (channels.length === 0) {
        maxHoldMs = config.defaultMaxHoldMs; // 无 channel 用 default
      } else {
        let unknown = false;
        for (const ch of channels) {
          if (config.maxHoldMsByChannel !== undefined && !(ch in config.maxHoldMsByChannel)) {
            unknown = true;
          }
        }
        if (unknown) logDegraded("unknown_channel", { channels });
        // 多 channel 取 min（D26）
        maxHoldMs = Math.min(
          ...channels.map((ch) => config.maxHoldMsByChannel?.[ch] ?? config.defaultMaxHoldMs),
        );
      }
      // 同 channel 互斥（channelOf 数组时任一 channel 冲突都触发）
      const interruptedIds: string[] = [];
      for (const [id, entry] of [...active]) {
        const other = channelsOf(entry.signal);
        const overlap = channels.some((ch) => other.includes(ch));
        if (overlap && strategy.shouldInterrupt(entry.signal, signal)) {
          interruptedIds.push(id);
        }
      }
      for (const id of interruptedIds) releaseInternal(id, "interrupted");

      active.set(signal.id, { signal, submittedAt: nowTs, maxHoldMs });
      for (const cb of [...dispatchCbs]) {
        try {
          cb(signal);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[arbiter] onDispatch callback error", err);
        }
      }
    },
    cancel(signalId: string): void {
      releaseInternal(signalId, "cancelled");
    },
    notifyRelease(signalId: string, reason: ReleaseReason): void {
      releaseInternal(signalId, reason);
    },
    onDispatch(cb: (signal: ExpressionSignal) => void): () => void {
      dispatchCbs.add(cb);
      return () => {
        dispatchCbs.delete(cb);
      };
    },
    onRelease(cb: (signalId: string, reason: ReleaseReason) => void): () => void {
      releaseCbs.add(cb);
      return () => {
        releaseCbs.delete(cb);
      };
    },
    setStrategy(s: ArbitrationStrategy): void {
      strategy = s;
    },
    activeSignals(): ReadonlyArray<ExpressionSignal> {
      return [...active.values()].map((e) => e.signal);
    },
    strategy(): Readonly<ArbitrationStrategy> {
      return strategy;
    },
    dispose(): void {
      if (disposed) return;
      for (const id of [...active.keys()]) {
        releaseInternal(id, "cancelled");
      }
      clearInterval(watchdog);
      disposed = true;
    },
  };
}
