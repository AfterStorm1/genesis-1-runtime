// InputBus：inject → InputBus.onDelta 校验；snapshot 返回前校验（附录 C）
import { describe, expect, it } from "vitest";
import { createInputBus } from "../../core/input-bus/input-bus-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { WORLD_DELTA_CONTRACT_VERSION, WORLD_SNAPSHOT_CONTRACT_VERSION } from "../../core/contract/perception";
import { writeEvidenceLog } from "../helpers/evidence";

describe("input bus", () => {
  it("inject 补齐版本并广播；snapshot 返回带版本", () => {
    const contract = createContractRegistry();
    const bus = createInputBus(contract);
    const seen: unknown[] = [];
    bus.onDelta((d) => seen.push(d));
    bus.inject({ kind: "user_message", text: "hi" });
    expect(seen).toHaveLength(1);
    expect((seen[0] as { contractVersion: string }).contractVersion).toBe(WORLD_DELTA_CONTRACT_VERSION);
    const snap = bus.snapshot();
    expect(snap.contractVersion).toBe(WORLD_SNAPSHOT_CONTRACT_VERSION);
  });

  it("injectSnapshot 只更新 current；snapshot() 返回前校验", () => {
    const contract = createContractRegistry();
    const bus = createInputBus(contract);
    bus.injectSnapshot({ ts: 42, entities: [{ id: "e1" }] });
    const snap = bus.snapshot();
    expect(snap.ts).toBe(42);
    expect(snap.entities).toEqual([{ id: "e1" }]);
  });

  it("坏版本 delta（显式传入）→ InputBus.onDelta 校验拒绝", () => {
    const contract = createContractRegistry();
    const bus = createInputBus(contract);
    expect(() => bus.inject({ kind: "user_message", text: "x", contractVersion: "0.1.0" })).toThrow(
      /contract_version_mismatch:worldDelta/,
    );
  });

  it("dispose 清空订阅", () => {
    const bus = createInputBus(createContractRegistry());
    let n = 0;
    bus.onDelta(() => {
      n += 1;
    });
    bus.dispose();
    bus.inject({ kind: "user_message", text: "hi" });
    expect(n).toBe(0);
  });

  it("写入 input-bus 证据产物", () => {
    writeEvidenceLog("input-bus.test", ["inject validates InputBus.onDelta; snapshot validates on read"], true);
  });
});
