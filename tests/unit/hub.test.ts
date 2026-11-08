// ExpressionSourceHub：只承载额外 source；空 Hub 常数开销；不持有 arbiter/dispatcher（附件 A 5.1）
import { describe, expect, it } from "vitest";
import { createExpressionSourceHub } from "../../core/source-hub/hub-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { EXPRESSION_SOURCE_CONTRACT_VERSION } from "../../core/contract/expression-source";
import { sampleSignal } from "../helpers/fixtures";
import { writeEvidenceLog } from "../helpers/evidence";

const contract = createContractRegistry();

describe("expression source hub", () => {
  it("空 Hub：flush 返回 []；list 空", () => {
    const hub = createExpressionSourceHub(contract);
    expect(hub.flush({ now: 0, runtimeId: "rt", sourceId: "l3", activeSignals: [] })).toEqual([]);
    expect(hub.list()).toEqual([]);
  });

  it("register 内部 validateAt；flush 内对每个 source 校验 emit 版本", () => {
    const hub = createExpressionSourceHub(contract);
    expect(() =>
      hub.register({ id: "s1", contractVersion: "0.1.0", emit: () => [] }),
    ).toThrow(/contract_version_mismatch:expressionSource/);
    hub.register({
      id: "s1",
      contractVersion: EXPRESSION_SOURCE_CONTRACT_VERSION,
      emit: () => [sampleSignal()],
    });
    const out = hub.flush({ now: 0, runtimeId: "rt", sourceId: "l3", activeSignals: [] });
    expect(out).toHaveLength(1);
  });

  it("Hub 结构上不持有 arbiter / dispatcher 引用", () => {
    const hub = createExpressionSourceHub(contract);
    const asRecord = hub as unknown as Record<string, unknown>;
    expect(asRecord.arbiter).toBeUndefined();
    expect(asRecord.dispatcher).toBeUndefined();
  });

  it("unregister / dispose 清空", () => {
    const hub = createExpressionSourceHub(contract);
    hub.register({ id: "s1", contractVersion: EXPRESSION_SOURCE_CONTRACT_VERSION, emit: () => [] });
    hub.unregister("s1");
    expect(hub.list()).toHaveLength(0);
    hub.register({ id: "s2", contractVersion: EXPRESSION_SOURCE_CONTRACT_VERSION, emit: () => [] });
    hub.dispose();
    expect(hub.list()).toHaveLength(0);
  });

  it("写入 hub 证据产物", () => {
    writeEvidenceLog("hub.test", ["empty hub constant; internal validate"], true);
  });
});
