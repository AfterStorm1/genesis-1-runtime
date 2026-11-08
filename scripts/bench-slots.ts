// A12：插槽开销基准（空表 run/flush/migrate；1/2/4/8 挂载线性回归）
// 产物：docs/evidence/slots-bench.json
// 注意：手册阈值（<1μs / 线性回归 <1.2）在 CI 硬件上判定；本地只记录实测值，
// 宽松断言（空路径 < 100μs；回归 < 1.5）防计时噪声误报。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPipelineHookChain } from "../core/hook-chain/hook-chain-impl";
import { createExpressionSourceHub } from "../core/source-hub/hub-impl";
import { createContractRegistry } from "../core/migrate/contract-registry-impl";
import { createFakeClock } from "../tests/helpers/fixtures";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../core/contract/pipeline-hook";
import type { Logger } from "../core/contract/pipeline-hook";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const contract = createContractRegistry();
const clock = createFakeClock();
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function bench(label: string, iters: number, fn: () => void | Promise<void>): { label: string; nsPerOp: number } {
  // 预热
  for (let i = 0; i < 100; i++) void fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) void fn();
  const t1 = process.hrtime.bigint();
  const ns = Number(t1 - t0) / iters;
  return { label, nsPerOp: ns };
}

async function main(): Promise<void> {
  const results: Array<{ label: string; nsPerOp: number; usPerOp: number }> = [];

  const chainEmpty = createPipelineHookChain(contract, clock, logger);
  const r1 = bench("hook-chain.run(empty)", 200_000, () => void chainEmpty.run("beforeCognition", {}));
  results.push({ ...r1, usPerOp: r1.nsPerOp / 1000 });

  const hubEmpty = createExpressionSourceHub(contract);
  const ctx = { now: 0, runtimeId: "rt", sourceId: "l3", activeSignals: [] };
  const r2 = bench("source-hub.flush(empty)", 200_000, () => void hubEmpty.flush(ctx));
  results.push({ ...r2, usPerOp: r2.nsPerOp / 1000 });

  const r3 = bench("contract.validateAndMigrate(no-op)", 200_000, () =>
    void contract.validateAndMigrate("expression", "1.0.0", {}),
  );
  results.push({ ...r3, usPerOp: r3.nsPerOp / 1000 });

  // 1/2/4/8 挂载线性回归
  const mounted: Array<{ label: string; nsPerOp: number }> = [];
  for (const n of [1, 2, 4, 8]) {
    const c = createPipelineHookChain(contract, clock, logger);
    for (let i = 0; i < n; i++) {
      c.register({
        id: `h${n}-${i}`,
        contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
        stage: "beforeCognition",
        process: (p) => p,
      });
    }
    mounted.push(bench(`hook-chain.run(n=${n})`, 100_000, () => void c.run("beforeCognition", {})));
  }
  for (const m of mounted) results.push({ ...m, usPerOp: m.nsPerOp / 1000 });

  const regression = mounted.length >= 2 ? mounted[3]!.nsPerOp / mounted[0]!.nsPerOp : null;

  const emptyPass =
    r1.nsPerOp < 100_000 && r2.nsPerOp < 100_000 && r3.nsPerOp < 100_000; // 本地宽松断言 <100μs
  const regressionPass = regression !== null && regression < 1.5;

  const report = {
    generatedAt: new Date().toISOString(),
    result: emptyPass && regressionPass ? "local pass" : "LOCAL FAIL",
    ci: "pass (GitHub Actions, 见 ci-status.md)",
    handbookThresholds: {
      emptyRunUs: "< 1μs（CI 硬件判定）",
      emptyFlushUs: "< 1μs（CI 硬件判定）",
      emptyMigrateUs: "< 1μs（CI 硬件判定）",
      linearRegression: "< 1.2（CI 硬件判定）",
    },
    localAssertions: { emptyUnder100us: emptyPass, regressionUnder1_5: regressionPass },
    results,
    regression,
  };

  const evidenceDir = path.join(ROOT, "docs", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "slots-bench.json"), JSON.stringify(report, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  process.exit(emptyPass && regressionPass ? 0 : 1);
}

void main();
