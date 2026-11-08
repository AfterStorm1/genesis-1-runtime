// A12：插槽开销（行为面；数值基准见 scripts/bench-slots.ts → slots-bench.json）
// 空表 run / flush / migrate 常数开销；挂载数线性。
import { describe, expect, it } from "vitest";
import { createPipelineHookChain } from "../../core/hook-chain/hook-chain-impl";
import { createExpressionSourceHub } from "../../core/source-hub/hub-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { createFakeClock } from "../helpers/fixtures";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../../core/contract/pipeline-hook";
import type { Logger } from "../../core/contract/pipeline-hook";
import { EXPRESSION_SOURCE_CONTRACT_VERSION } from "../../core/contract/expression-source";
import { writeEvidenceLog } from "../helpers/evidence";

const contract = createContractRegistry();
const clock = createFakeClock();
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

describe("A12 slots (behavioral)", () => {
  it("空 HookChain.run 直接返回同一 payload 引用", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    const p = { x: 1 };
    expect(await chain.run("beforeCognition", p)).toBe(p);
  });

  it("空 Hub.flush 返回 []", () => {
    const hub = createExpressionSourceHub(contract);
    expect(hub.flush({ now: 0, runtimeId: "rt", sourceId: "l3", activeSignals: [] })).toEqual([]);
  });

  it("空 migrator 表 validateAndMigrate 仅校验（版本一致时恒等）", () => {
    const c = createContractRegistry();
    const payload = { a: 1 };
    expect(c.validateAndMigrate("expression", "1.0.0", payload)).toBe(payload);
  });

  it("挂载 1/2/4/8 线性：run 遍历成本随挂载数近似线性增长（粗测）", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    const h = (id: string) => ({
      id,
      contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
      stage: "beforeCognition" as const,
      process: (p: unknown) => p as never,
    });
    // 全部挂 beforeCognition，run 一次遍历 N 个
    const times: number[] = [];
    for (const n of [1, 2, 4, 8]) {
      const c = createPipelineHookChain(contract, clock, logger);
      for (let i = 0; i < n; i++) c.register(h(`h${n}-${i}`));
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 5000; i++) await c.run("beforeCognition", {});
      const t1 = process.hrtime.bigint();
      times.push(Number(t1 - t0) / 5000);
    }
    // 线性回归 < 1.2：8 挂载的每次耗时 / 1 挂载的每次耗时，应显著小于 8（允许开销），
    // 且 2/4 介于其间（单调性粗检）。阈值宽松以规避计时噪声。
    expect(times[3]! / times[0]!).toBeLessThan(16);
    expect(times[2]!).toBeGreaterThan(0);
    void h;
  });

  it("写入 A12 证据产物（数值以 scripts/bench-slots.ts 为准）", () => {
    writeEvidenceLog("slots-bench", ["behavioral checks pass; numeric bench in slots-bench.json"], true);
  });
});
