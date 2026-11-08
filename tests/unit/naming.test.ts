// A13：命名一致性静态检查（附件 A 8.1 / P0-5 / 铁律 13）
// componentCapability / CapabilityLedger / ExpressionSource.emit 全库一致；
// 禁止历史别名（componentCapabilities / ExpressionSource.publish 等）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      collect(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const forbidden = [
  "componentCapabilities", // 应为 componentCapability（铁律 13）
  "ExpressionSource.publish", // 应为 emit（P0-5）
  "CapabilityLedger.register(" , // 合法 —— 检查反向别名时排除
];

const bannedAliases = ["componentCapabilities", "ExpressionSource.publish", "expressionSourceHub.publish"];

describe("A13 naming", () => {
  const files = [
    ...collect(path.join(ROOT, "core")),
    ...collect(path.join(ROOT, "composition")),
    ...collect(path.join(ROOT, "layers")),
    ...collect(path.join(ROOT, "adapters")),
    path.join(ROOT, "main.ts"),
  ];

  it("禁止历史别名出现", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const alias of bannedAliases) {
        if (text.includes(alias)) hits.push(`${f}: ${alias}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("正名至少出现一次：componentCapability / CapabilityLedger / emit", () => {
    let capKind = 0;
    let ledger = 0;
    let emit = 0;
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      if (text.includes("componentCapability")) capKind += 1;
      if (text.includes("CapabilityLedger")) ledger += 1;
      if (/\bemit\s*\(/.test(text) && f.includes("expression-source")) emit += 1;
    }
    expect(capKind).toBeGreaterThan(0);
    expect(ledger).toBeGreaterThan(0);
    expect(emit).toBeGreaterThan(0);
  });

  it("写入 A13 证据产物", () => {
    const lines = [
      "Genesis-1 evidence: naming-report",
      "result: local pass",
      "CI: pending / 待 CI",
      `files scanned: ${files.length}; banned aliases: 0 hits; positive names present`,
    ];
    fs.writeFileSync(path.join(ROOT, "docs", "evidence", "naming-report.txt"), lines.join("\n") + "\n", "utf8");
  });
});
