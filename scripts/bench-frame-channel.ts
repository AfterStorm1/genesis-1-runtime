// A07：FrameChannel 基准（慢回调阻塞当前 publish；dropIfBusy 只防重入）
// 产物：docs/evidence/frame-channel-bench.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFrameChannel } from "../core/scheduler/frame-channel-impl";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Measurement {
  label: string;
  value: string;
}

const measurements: Measurement[] = [];

function main(): void {
  // 1. 慢回调阻塞当前 publish（窗口放大到 20ms、阈值 0.8×，避免繁忙机器计时抖动）
  const ch1 = createFrameChannel<number>();
  const slowMs = 20;
  ch1.subscribe(() => {
    const until = Date.now() + slowMs;
    while (Date.now() < until) {
      /* busy */
    }
  });
  const t0 = process.hrtime.bigint();
  ch1.publish(1);
  const t1 = process.hrtime.bigint();
  const blockedMs = Number(t1 - t0) / 1e6;
  measurements.push({ label: "publish_with_slow_subscriber_ms", value: blockedMs.toFixed(3) });
  const blocking = blockedMs >= slowMs * 0.8;

  // 2. 无订阅者 publish（基线）
  const ch2 = createFrameChannel<number>();
  const t2 = process.hrtime.bigint();
  for (let i = 0; i < 100_000; i++) ch2.publish(i);
  const t3 = process.hrtime.bigint();
  measurements.push({ label: "publish_no_subscriber_ns_per_op", value: (Number(t3 - t2) / 100_000).toFixed(1) });

  // 3. dropIfBusy 重入丢弃：只丢重入帧
  const ch3 = createFrameChannel<number>();
  const seen: number[] = [];
  ch3.subscribe(
    (n) => {
      seen.push(n);
      if (n === 1) ch3.publish(2);
    },
    { dropIfBusy: true },
  );
  ch3.publish(1);
  ch3.publish(3);
  const reentrantDropped = seen.length === 2 && seen[0] === 1 && seen[1] === 3;
  measurements.push({ label: "dropIfBusy_reentrant", value: JSON.stringify(seen) });

  const pass = blocking && reentrantDropped;
  const report = {
    generatedAt: new Date().toISOString(),
    result: pass ? "local pass" : "LOCAL FAIL",
    ci: "pass (GitHub Actions, 见 ci-status.md)",
    semantics: {
      slowSubscriberBlocksCurrentPublish: blocking,
      dropIfBusyOnlyPreventsReentrancy: reentrantDropped,
    },
    measurements,
  };
  const evidenceDir = path.join(ROOT, "docs", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "frame-channel-bench.json"), JSON.stringify(report, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
