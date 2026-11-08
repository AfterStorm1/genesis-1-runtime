// 证据产物写入助手（任务书 8 / 附件 C）
// 本地跑过写 local pass；CI 状态见 docs/evidence/ci-status.md（GitHub Actions 全绿后写 pass）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVIDENCE_DIR = fileURLToPath(new URL("../../docs/evidence", import.meta.url));

export function writeEvidenceLog(name: string, lines: string[], passed: boolean): string {
  const header = [
    `Genesis-1 evidence: ${name}`,
    `result: ${passed ? "local pass" : "LOCAL FAIL"}`,
    "CI: pass (GitHub Actions, 见 ci-status.md)",
    ...lines,
  ];
  const file = path.join(EVIDENCE_DIR, `${name}.log`);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(file, header.join("\n") + "\n", "utf8");
  return file;
}

export function evidenceDir(): string {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return EVIDENCE_DIR;
}
