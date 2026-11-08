// Scheduler + 体感最小链路（附件 A 3.4 / P0-3 / P1-R2 / D54）
// attachTrackingSource 注册期校验；submit/submitExpression 校验；
// onFrame 不直接 validateAt L35.emitFrame；L3.5 出口 enforceActuatorFrame。
import { describe, expect, it, vi } from "vitest";
import { createScheduler } from "../../core/scheduler/scheduler-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { createSafetyEnforcer } from "../../core/safety/safety-enforcer-impl";
import { mergeSafetyDefaults } from "../../core/safety/merge";
import { createParameterRegistry } from "../../core/parameter/parameter-registry-impl";
import { createFakeClock } from "../helpers/fixtures";
import { createEmptyTrackingSource } from "../../adapters/perception/empty-tracking-source";
import { SPATIAL_CONTRACT_VERSION, TRACKING_CONTRACT_VERSION, EXPRESSION_FRAME_INTENT_CONTRACT_VERSION } from "../../core/contract/spatial";
import { __getValidateAtCounts, __resetValidateAtCounts } from "../../core/contract/entry-points";
import { writeEvidenceLog } from "../helpers/evidence";

function makeScheduler() {
  const contract = createContractRegistry();
  const clock = createFakeClock();
  const parameter = createParameterRegistry();
  parameter.register({ contractVersion: "1.0.0", name: "Viseme", kind: "number", range: [0, 15], default: 0 });
  const safety = createSafetyEnforcer(mergeSafetyDefaults({}).merged, parameter);
  const scheduler = createScheduler(clock, safety, contract);
  return { contract, clock, parameter, safety, scheduler };
}

describe("scheduler", () => {
  it("attachTrackingSource 注册期校验（坏版本拒绝）", () => {
    const { scheduler } = makeScheduler();
    const bad = { id: "t:bad", contractVersion: "0.1.0", channel: createEmptyTrackingSource().channel };
    expect(() => scheduler.attachTrackingSource(bad)).toThrow(/contract_version_mismatch:trackingFrame/);
  });

  it("体感最小链路：TrackingFrame → Scheduler → FrameChannel → ActuatorFrame", () => {
    const { scheduler, clock } = makeScheduler();
    const source = createEmptyTrackingSource();
    const frames: Array<{ parameters: Record<string, number | boolean> }> = [];
    const unsub = scheduler.onFrame((f) => frames.push(f));
    scheduler.attachTrackingSource(source);
    source.publish({
      contractVersion: TRACKING_CONTRACT_VERSION,
      ts: 1,
      source: source.id,
      bones: {},
      confidence: 0.9,
    });
    clock.tick(); // 假时钟手动驱动一帧
    expect(frames.length).toBeGreaterThanOrEqual(1);
    unsub();
    scheduler.dispose();
  });

  it("submit / submitExpression 校验；expression 参数进入帧并经 enforceActuatorFrame 丢弃未注册项", () => {
    const { scheduler, clock } = makeScheduler();
    const frames: Array<{ parameters: Record<string, number | boolean> }> = [];
    scheduler.onFrame((f) => frames.push(f));
    scheduler.attachTrackingSource(createEmptyTrackingSource());
    expect(() =>
      scheduler.submit({ contractVersion: "0.1.0", id: "i1", kind: "idle", sourceId: "s" }),
    ).toThrow(/contract_version_mismatch:spatialIntent/);
    scheduler.submit({ contractVersion: SPATIAL_CONTRACT_VERSION, id: "i1", kind: "idle", sourceId: "s" });
    scheduler.submitExpression({
      contractVersion: EXPRESSION_FRAME_INTENT_CONTRACT_VERSION,
      id: "e1",
      signalId: "s1",
      target: { parameters: { Viseme: 99, NotRegistered: 123 } },
    });
    clock.tick(); // 手动驱动一帧
    expect(frames[0]!.parameters).toEqual({ Viseme: 15 }); // clamp 99→15；未注册丢弃
    scheduler.dispose();
  });

  it("onFrame 不直接 validateAt L35.emitFrame（Scheduler 内无该 entry 调用）", () => {
    const { scheduler, clock } = makeScheduler();
    __resetValidateAtCounts();
    scheduler.attachTrackingSource(createEmptyTrackingSource());
    clock.tick();
    // scheduler-impl 内部无 L35.emitFrame 校验（由 composition SampledValidator 承担）
    expect(__getValidateAtCounts().get("L35.emitFrame") ?? 0).toBe(0);
    scheduler.dispose();
  });

  it("写入 scheduler 证据产物", () => {
    writeEvidenceLog("scheduler.test", ["attach validates; frame chain; expression params clamped"], true);
  });
});
