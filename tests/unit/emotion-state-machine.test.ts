// 情绪状态机（轻量 InternalDrive）：转移表 / 衰减 / 自主说话阈值与冷却（值级扩展测试）
import { describe, expect, it } from "vitest";
import { createEmotionStateMachine, classifyEmotionEvent } from "../../adapters/drive/emotion-state-machine";
import { writeEvidenceLog } from "../helpers/evidence";

function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("emotion state machine", () => {
  it("夸奖切换到 happy 并提升强度；强度上限 1", () => {
    const clock = makeClock();
    const m = createEmotionStateMachine({ now: clock.now });
    const s = m.applyEvent({ type: "praise", magnitude: 1 });
    expect(s.emotion).toBe("happy");
    expect(s.intensity).toBeGreaterThan(0.3);
    for (let i = 0; i < 20; i++) m.applyEvent({ type: "praise", magnitude: 1 });
    expect(m.state().intensity).toBeLessThanOrEqual(1);
  });

  it("批评切换到 sad 且效价转负；安抚回落 calm", () => {
    const clock = makeClock();
    const m = createEmotionStateMachine({ now: clock.now });
    m.applyEvent({ type: "criticism", magnitude: 1 });
    expect(m.state().emotion).toBe("sad");
    expect(m.state().valence).toBeLessThan(0);
    m.applyEvent({ type: "comfort", magnitude: 1 });
    expect(m.state().emotion).toBe("calm");
  });

  it("时间衰减：强度向基线回落，回落到基线后情绪回 calm", async () => {
    const clock = makeClock();
    const m = createEmotionStateMachine({ now: clock.now, baseline: { emotion: "calm", intensity: 0.3 } });
    m.applyEvent({ type: "praise", magnitude: 1 });
    expect(m.state().intensity).toBeGreaterThan(0.3);
    clock.advance(60 * 60_000); // 1 小时
    await m.tick(clock.now());
    expect(m.state().intensity).toBeLessThan(0.5);
    clock.advance(10 * 24 * 60 * 60_000); // 10 天
    await m.tick(clock.now());
    expect(m.state().emotion).toBe("calm");
    expect(m.state().intensity).toBeCloseTo(0.3, 1);
  });

  it("自主说话：波动超阈值且过冷却 → DriveIntent(self_talk)；冷却内不重复", async () => {
    const clock = makeClock();
    const m = createEmotionStateMachine({ now: clock.now, selfTalkThreshold: 0.2, cooldownMs: 90_000 });
    m.applyEvent({ type: "stress", magnitude: 1 }); // sad 0.3+0.3=0.6，偏离 0.3
    const intent = await m.tick(clock.now());
    expect(intent?.kind).toBe("self_talk");
    expect(intent?.payload).toMatchObject({ emotion: "sad" });
    expect(await m.tick(clock.now() + 1_000)).toBeNull(); // 冷却内
    clock.advance(100_000);
    expect((await m.tick(clock.now()))?.kind).toBe("self_talk");
    expect(m.snapshot().lastIntent?.kind).toBe("self_talk");
  });

  it("classifyEmotionEvent 关键词映射", () => {
    expect(classifyEmotionEvent("你好厉害啊").type).toBe("praise");
    expect(classifyEmotionEvent("我最近压力好大").type).toBe("stress");
    expect(classifyEmotionEvent("想抱抱你").type).toBe("bonding");
    expect(classifyEmotionEvent("随便聊聊").type).toBe("neutral");
  });

  it("写入 emotion-state-machine 证据产物", () => {
    writeEvidenceLog("emotion-state-machine.test", ["transition table; decay; self-talk threshold+cooldown; classify"], true);
  });
});
