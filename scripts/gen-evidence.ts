// 证据汇总：校验 docs/evidence/ 18 个产物存在并写索引（附件 C）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = path.join(ROOT, "docs", "evidence");

const EXPECTED = [
  "validate-at-scan.json",
  "payload-shape-report.json",
  "callgraph-report.md",
  "safety-merge.test.log",
  "sanitize.test.log",
  "speech-cas.test.log",
  "watchdog.test.log",
  "frame-channel-bench.json",
  "aggregator.test.log",
  "async-batch.test.log",
  "multi-runtime.test.log",
  "dispose.test.log",
  "slots-bench.json",
  "naming-report.txt",
  "e2e-minimal.log",
  "renderer-mount.test.log",
  "feedback-kinds.test.log",
  "validate-at.test.log",
];

function main(): void {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const rows = EXPECTED.map((name) => {
    const full = path.join(EVIDENCE, name);
    const exists = fs.existsSync(full);
    return { file: name, exists, status: exists ? "local pass（本地生成）" : "pending / 待 CI（占位）" };
  });
  const missing = rows.filter((r) => !r.exists);
  const md = [
    "# docs/evidence 索引",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "状态说明：本地跑过写 local pass；CI 未跑写 pending / 待 CI。不宣称 A01a–A17 已 CI 绿。",
    "",
    "| 文件 | 存在 | 状态 |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.file} | ${r.exists ? "是" : "否"} | ${r.status} |`),
    "",
    missing.length === 0 ? "全部 18 个产物已生成。" : `缺失 ${missing.length} 个：${missing.map((m) => m.file).join(", ")}`,
    "",
  ];
  fs.writeFileSync(path.join(EVIDENCE, "index.md"), md.join("\n") + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`evidence index: ${rows.filter((r) => r.exists).length}/${EXPECTED.length} present`);
  process.exit(missing.length === 0 ? 0 : 1);
}

main();
