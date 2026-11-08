// 交接文档生成器：docs/HANDOVER.md（固定位置，任何会话可一键刷新）
// 运行：pnpm handover（等价 node node_modules\tsx\dist\cli.mjs scripts/gen-handover.ts）
// 内容 = 自动快照（时间/版本/文件统计/测试数/证据状态/git log/ollama 模型）
//      + 静态说明（docs/def/handover-notes.md，人工维护的核心上下文）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const EVIDENCE = path.join(ROOT, "docs", "evidence");
const NOTES = path.join(ROOT, "docs", "def", "handover-notes.md");
const OUT = path.join(ROOT, "docs", "HANDOVER.md");

function tryExec(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT, timeout: 15_000 }).trim();
  } catch {
    return null;
  }
}

function countFiles(dir: string): number {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else if (e.name.endsWith(".ts") || e.name.endsWith(".json") || e.name.endsWith(".md")) n += 1;
  }
  return n;
}

function countTests(): number {
  let n = 0;
  for (const dir of [path.join(ROOT, "tests", "unit"), path.join(ROOT, "tests", "e2e")]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      n += (text.match(/\bit\(/g) ?? []).length;
    }
  }
  return n;
}

function evidenceStatus(): string[] {
  const expected = [
    "validate-at-scan.json", "payload-shape-report.json", "callgraph-report.md",
    "safety-merge.test.log", "sanitize.test.log", "speech-cas.test.log", "watchdog.test.log",
    "frame-channel-bench.json", "aggregator.test.log", "async-batch.test.log",
    "multi-runtime.test.log", "dispose.test.log", "slots-bench.json", "naming-report.txt",
    "e2e-minimal.log", "renderer-mount.test.log", "feedback-kinds.test.log", "validate-at.test.log",
  ];
  const present = expected.filter((f) => fs.existsSync(path.join(EVIDENCE, f))).length;
  const ci = fs.existsSync(path.join(EVIDENCE, "ci-status.md"))
    ? (fs.readFileSync(path.join(EVIDENCE, "ci-status.md"), "utf8").match(/全绿/) ? "CI 全绿" : "见 ci-status.md")
    : "未知";
  return [`证据产物：${present}/${expected.length}`, `CI 状态：${ci}`];
}

function main(): void {
  const gitLog = tryExec("git", ["log", "--oneline", "-8"]) ?? "（无法读取；在终端运行 pnpm handover 可补全）";
  const nodeVer = tryExec("node", ["--version"]) ?? "未知";
  const models = tryExec("ollama", ["list"]) ?? "（ollama 不可用或未安装）";

  const lines: string[] = [];
  lines.push("# HANDOVER — Genesis-1 交接文档");
  lines.push("");
  lines.push(`> 自动生成时间：${new Date().toISOString()}（北京时间 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}）`);
  lines.push(`> 刷新方式：\`pnpm handover\`（或 \`node node_modules\\tsx\\dist\\cli.mjs scripts/gen-handover.ts\`）。`);
  lines.push("> 本文件 = 下方自动快照 + docs/def/handover-notes.md 静态说明。新会话先读本文件。");
  lines.push("");
  lines.push("## 自动快照");
  lines.push("");
  lines.push(`- Node 版本：${nodeVer}`);
  lines.push(`- 代码规模：core ${countFiles(path.join(ROOT, "core"))} 个文件 / adapters ${countFiles(path.join(ROOT, "adapters"))} / tests ${countFiles(path.join(ROOT, "tests"))} / 全仓约 ${countFiles(ROOT) - countFiles(path.join(ROOT, "node_modules"))} 个文件（不含 node_modules）`);
  lines.push(`- 测试用例：约 ${countTests()} 个（unit + e2e，含 A01a–A17 对应断言）`);
  lines.push(`- ${evidenceStatus().join("；")}`);
  lines.push("");
  lines.push("### 最近提交（git log -8）");
  lines.push("");
  for (const l of gitLog.split(/\r?\n/)) lines.push(`\`${l}\``);
  lines.push("");
  lines.push("### 本地 Ollama 模型");
  lines.push("");
  lines.push("```");
  for (const l of models.split(/\r?\n/)) lines.push(l);
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  if (fs.existsSync(NOTES)) {
    lines.push(fs.readFileSync(NOTES, "utf8"));
  } else {
    lines.push("（docs/def/handover-notes.md 缺失，请补写静态说明）");
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`handover written: ${OUT}`);
}

main();
