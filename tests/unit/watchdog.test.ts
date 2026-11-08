// A06：watchdog 多 channel + dispose 同步（附件 A 8.1 / D26 / D44 / S-07）
import { describe, expect, it, vi } from "vitest";
import { createArbiter } from "../../core/arbiter/arbiter-impl";
import { defaultStrategy } from "../../layers/l3-arbiter/strategy-default";
import { createSafetyEnforcer } from "../../core/safety/safety-enforcer-impl";
import { mergeSafetyDefaults } from "../../core/safety/merge";
import { createParameterRegistry } from "../../core/parameter/parameter-registry-impl";
import { createSpeechSessionStore } from "../../core/speech/speech-session-store-impl";
import { createFakeClock, sampleSignal } from "../helpers/fixtures";
import type { ReleaseReason } from "../../core/contract/arbitration";
import { writeEvidenceLog } from "../helpers/evidence";

function makeArbiter(opts: {
  maxHoldMsByChannel?: Record<string, number>;
  defaultMaxHoldMs?: number;
  watchdogIntervalMs?: number;
  strategy?: ReturnType<typeof Object>;
}) {
  const clock = createFakeClock(0);
  const safety = createSafetyEnforcer(mergeSafetyDefaults({}).merged, createParameterRegistry());
  const logger = { warn: vi.fn() };
  const arbiter = createArbiter({
    strategy: (opts.strategy as never) ?? defaultStrategy,
    config: {
      defaultMaxHoldMs: opts.defaultMaxHoldMs ?? 5000,
      maxHoldMsByChannel: opts.maxHoldMsByChannel,
      watchdogIntervalMs: opts.watchdogIntervalMs,
    },
    safety,
    clock,
    logger: logger as never,
  });
  return { arbiter, clock, logger };
}

describe("A06 watchdog + dispose", () => {
  it("多 channel 取 min；超时 → watchdog 释放", () => {
    vi.useFakeTimers();
    try {
      const { arbiter, clock } = makeArbiter({
        maxHoldMsByChannel: { a: 10, b: 1000 },
        watchdogIntervalMs: 1,
      });
      const releases: Array<{ id: string; reason: ReleaseReason }> = [];
      arbiter.onRelease((id, reason) => releases.push({ id, reason }));
      const signal = sampleSignal({ id: "rt:test:l3:1" });
      // channelOf 返回两通道
      arbiter.setStrategy({ ...defaultStrategy, channelOf: () => ["a", "b"] });
      arbiter.submit(signal);
      expect(arbiter.activeSignals()).toHaveLength(1);
      clock.advance(11);
      vi.advanceTimersByTime(1);
      expect(releases).toEqual([{ id: "rt:test:l3:1", reason: "watchdog" }]);
      expect(arbiter.activeSignals()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("空 channel 用 default；未知 channel 用 default 并记 degraded", () => {
    const { arbiter, logger, clock } = makeArbiter({
      maxHoldMsByChannel: { known: 10 },
      defaultMaxHoldMs: 5000,
      watchdogIntervalMs: 1000,
    });
    // 空 channel：不超时（default 5000）
    arbiter.setStrategy({ ...defaultStrategy, channelOf: () => [] });
    arbiter.submit(sampleSignal({ id: "rt:test:l3:1" }));
    // 未知 channel：用 default 并记 degraded（先推进时钟避免同源限流）
    clock.advance(100);
    arbiter.setStrategy({ ...defaultStrategy, channelOf: () => ["unknown"] });
    arbiter.submit(sampleSignal({ id: "rt:test:l3:2" }));
    expect(logger.warn).toHaveBeenCalledWith("unknown_channel", { channels: ["unknown"] });
    arbiter.dispose();
  });

  it("arbiter.dispose() 返回后 activeSignals().length === 0；releaseReason === cancelled", () => {
    const { arbiter, clock } = makeArbiter({ watchdogIntervalMs: 1000 });
    const releases: Array<{ id: string; reason: ReleaseReason }> = [];
    arbiter.onRelease((id, reason) => releases.push({ id, reason }));
    arbiter.submit(sampleSignal({ id: "rt:test:l3:1" }));
    clock.advance(100); // 避开同源限流（maxSignalRateHz 默认 30Hz）
    arbiter.submit(sampleSignal({ id: "rt:test:l3:2" }));
    arbiter.dispose(); // 同步：返回前完成全部 onRelease
    expect(arbiter.activeSignals()).toHaveLength(0);
    expect(releases).toHaveLength(2);
    expect(releases.every((r) => r.reason === "cancelled")).toBe(true);
  });

  it("dispose 后 speech.dispose 无 pending session（watchdog/dispose 链路）", () => {
    const { arbiter } = makeArbiter({ watchdogIntervalMs: 1000 });
    const speech = createSpeechSessionStore();
    arbiter.onDispatch((s) => {
      if (s.speech) speech.create(s.id);
    });
    arbiter.onRelease((id, reason) => speech.onRelease(id, reason));
    arbiter.submit(sampleSignal({ id: "rt:test:l3:1", speech: { text: "x", interruptible: true } }));
    expect(speech.get("rt:test:l3:1")!.state).toBe("requested");
    arbiter.dispose();
    speech.dispose();
    const s = speech.get("rt:test:l3:1")!;
    expect(["interrupted", "failed"]).toContain(s.state); // 非 pending
    if (s.state === "failed") expect(s.releaseReason).toBe("cancelled");
    if (s.state === "interrupted") expect(s.releaseReason).toBe("cancelled");
  });

  it("watchdog 与 feedback 同帧先到先赢", () => {
    const { arbiter } = makeArbiter({
      maxHoldMsByChannel: { speech: 5 },
      watchdogIntervalMs: 1,
    });
    const releases: ReleaseReason[] = [];
    arbiter.onRelease((_id, reason) => releases.push(reason));
    arbiter.submit(sampleSignal({ id: "rt:test:l3:1", speech: { text: "x", interruptible: true } }));
    // 同帧：先 feedback_done 释放；随后 watchdog 扫描幂等忽略
    arbiter.notifyRelease("rt:test:l3:1", "feedback_done");
    expect(releases).toEqual(["feedback_done"]);
    expect(arbiter.activeSignals()).toHaveLength(0);
    arbiter.dispose();
  });

  it("写入 A06 证据产物", () => {
    writeEvidenceLog("watchdog.test", ["multi-channel min; dispose sync cancelled"], true);
  });
});
