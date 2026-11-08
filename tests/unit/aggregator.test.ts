// A08：聚合规则（附件 A 8.1 / 3.8 默认合并规则）
import { describe, expect, it } from "vitest";
import { createDefaultAggregator } from "../../layers/l3-expression/aggregator-default";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { createMotionRegistry } from "../../core/motion/motion-registry-impl";
import { createSafetyEnforcer } from "../../core/safety/safety-enforcer-impl";
import { mergeSafetyDefaults } from "../../core/safety/merge";
import { createParameterRegistry } from "../../core/parameter/parameter-registry-impl";
import { defaultStrategy } from "../../layers/l3-arbiter/strategy-default";
import { markSanitized } from "../../core/contract/speech";
import { AGGREGATOR_CONTRACT_VERSION } from "../../core/contract/aggregator";
import type { AggregateContext } from "../../core/contract/aggregator";
import { createFakeClock, sampleEmotionOutput, sampleSignal } from "../helpers/fixtures";
import type { ExpressionSignal } from "../../core/contract/expression";
import type { EmotionIntent } from "../../core/contract/emotion";
import type { CognitionOutput } from "../../core/contract/cognition";
import { writeEvidenceLog } from "../helpers/evidence";

/** 构造 emotion 输出（避免对判别联合做非法属性展开） */
function emotionOut(intent: EmotionIntent, extra: { motionKey?: string } = {}): CognitionOutput {
  return { contractVersion: "1.0.0", kind: "emotion", intent, ...extra };
}

function makeCtx(overrides: Partial<AggregateContext> = {}): AggregateContext {
  const clock = createFakeClock(1000);
  let seq = 0;
  return {
    contractVersion: AGGREGATOR_CONTRACT_VERSION,
    clock,
    motion: createMotionRegistry(),
    safety: createSafetyEnforcer(mergeSafetyDefaults({}).merged, createParameterRegistry()),
    contract: createContractRegistry(),
    runtimeId: "rt:test",
    sourceId: "l3",
    activeSignalIds: [],
    activeSignals: [],
    strategy: defaultStrategy,
    nextId: () => `rt:test:l3:${++seq}`,
    ...overrides,
  };
}

const sanitized = markSanitized("hi");

describe("A08 aggregator", () => {
  it("多 emotion tie-break：intensity 降序；同 intensity 取数组后出现者；其余记 degraded", () => {
    const agg = createDefaultAggregator();
    const ctx = makeCtx();
    const [sig] = agg.aggregate(
      [
        sampleEmotionOutput,
        emotionOut({ emotion: "sad", intensity: 0.9, contextTags: [] }),
        emotionOut({ emotion: "angry", intensity: 0.9, contextTags: [] }),
      ],
      ctx,
    );
    expect(sig!.emotion.emotion).toBe("angry"); // 同 intensity 后出现者胜
    const log = agg.takeDegradedLog();
    expect(log.filter((l) => l.startsWith("emotion_tie_break"))).toHaveLength(2);
  });

  it("supersedes 指代 activeSignals 中 interruptible 且 channelOf 有交集者", () => {
    const agg = createDefaultAggregator();
    const active: ExpressionSignal[] = [
      sampleSignal({ id: "a1", interruptible: true, speech: { text: "x", interruptible: true } }),
      sampleSignal({ id: "a2", interruptible: false, speech: { text: "y", interruptible: false } }),
    ];
    const ctx = makeCtx({
      activeSignals: active,
      activeSignalIds: active.map((a) => a.id),
    });
    const [sig] = agg.aggregate(
      [
        sampleEmotionOutput,
        { contractVersion: "1.0.0", kind: "speech", speech: { text: "hi", interruptible: true, sanitizedText: sanitized } },
      ],
      ctx,
    );
    expect(sig!.supersedes).toEqual(["a1"]); // a2 不可中断 → 不含
  });

  it("缺 sanitizedText → 整批失败，记 degraded", () => {
    const agg = createDefaultAggregator();
    const ctx = makeCtx();
    const out = agg.aggregate(
      [
        sampleEmotionOutput,
        { contractVersion: "1.0.0", kind: "speech", speech: { text: "hi", interruptible: true } },
      ],
      ctx,
    );
    expect(out).toEqual([]);
    expect(agg.takeDegradedLog()).toContain("missing_sanitized_text");
  });

  it("motionKey 非法 → 整批失败，记 degraded", () => {
    const agg = createDefaultAggregator();
    const ctx = makeCtx();
    const out = agg.aggregate(
      [emotionOut({ emotion: "happy", intensity: 0.6, contextTags: ["test"] }, { motionKey: "not-registered" })],
      ctx,
    );
    expect(out).toEqual([]);
    expect(agg.takeDegradedLog()).toEqual(["invalid_motion_key:not-registered"]);
  });

  it("NaN intensity clamp 到 [0,1]；priority 公式 clamp", () => {
    const agg = createDefaultAggregator();
    const ctx = makeCtx();
    const [sig] = agg.aggregate(
      [emotionOut({ emotion: "x", intensity: Number.NaN, contextTags: [] })],
      ctx,
    );
    expect(sig!.priority).toBe(20); // 20 + 0*60 + 0
    const [sig2] = agg.aggregate(
      [emotionOut({ emotion: "x", intensity: 99, contextTags: [] })],
      makeCtx(),
    );
    expect(sig2!.priority).toBe(80); // 20 + 1*60
  });

  it("仅 speech：emotion 沿用 activeSignals ts 最大者；无则 neutral；vad {0,0,0}", () => {
    const agg = createDefaultAggregator();
    const active = [sampleSignal({ id: "a1", ts: 500, emotion: { emotion: "calm", intensity: 0.2, contextTags: [] } })];
    const ctx = makeCtx({ activeSignals: active });
    const [sig] = agg.aggregate(
      [{ contractVersion: "1.0.0", kind: "speech", speech: { text: "hi", interruptible: true, sanitizedText: sanitized } }],
      ctx,
    );
    expect(sig!.emotion.emotion).toBe("calm");
    expect(sig!.vad).toEqual({ valence: 0, arousal: 0, dominance: 0 });
    // 无 active → neutral
    const [sig2] = agg.aggregate(
      [{ contractVersion: "1.0.0", kind: "speech", speech: { text: "hi", interruptible: true, sanitizedText: sanitized } }],
      makeCtx(),
    );
    expect(sig2!.emotion.emotion).toBe("neutral");
  });

  it("tool_call / state_update 不产 signal；空批次返回 []", () => {
    const agg = createDefaultAggregator();
    expect(agg.aggregate([], makeCtx())).toEqual([]);
    const out = agg.aggregate(
      [
        { contractVersion: "1.0.0", kind: "tool_call", invocation: { toolName: "t", args: {}, callId: "c" } },
        { contractVersion: "1.0.0", kind: "state_update", patch: { a: 1 } },
      ],
      makeCtx(),
    );
    expect(out).toEqual([]);
  });

  it("signal.id 必须调 ctx.nextId()；同一批次共享 ts/sourceId/runtimeId", () => {
    const agg = createDefaultAggregator();
    const ctx = makeCtx();
    const [sig] = agg.aggregate([sampleEmotionOutput], ctx);
    expect(sig!.id).toBe("rt:test:l3:1");
    expect(sig!.ts).toBe(1000);
    expect(sig!.sourceId).toBe("l3");
    expect(sig!.runtimeId).toBe("rt:test");
  });

  it("写入 A08 证据产物", () => {
    writeEvidenceLog("aggregator.test", ["tie-break; supersedes; missing sanitized fails; NaN clamp"], true);
  });
});
