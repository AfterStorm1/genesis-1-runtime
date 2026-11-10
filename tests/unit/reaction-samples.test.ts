// 反应样本库：加载校验 / few-shot 块 / 验收判定（值级扩展测试）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFewShotBlock, loadReactionSamples, matchesExpected } from "../../adapters/llm/reaction-samples";
import { writeEvidenceLog } from "../helpers/evidence";

function writeSamples(entries: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-rx-"));
  const file = path.join(dir, "samples.json");
  fs.writeFileSync(file, JSON.stringify(entries), "utf8");
  return file;
}

describe("reaction samples", () => {
  it("加载合法样本；坏条目跳过并记入 warnings", () => {
    const file = writeSamples([
      { id: "a", situation: "夸我", reply: "谢谢", expected: ["谢谢"] },
      { id: "bad", situation: "缺字段" },
      "garbage",
    ]);
    const { samples, warnings } = loadReactionSamples(file);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.id).toBe("a");
    expect(warnings).toHaveLength(2);
  });

  it("文件不存在 / JSON 坏 → warnings + 空样本", () => {
    expect(loadReactionSamples("不存在的路径.json").warnings.length).toBeGreaterThan(0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-rx-"));
    const file = path.join(dir, "bad.json");
    fs.writeFileSync(file, "{ not json", "utf8");
    expect(loadReactionSamples(file).samples).toHaveLength(0);
  });

  it("few-shot 块：排除 localOnly 条目，含情境与标准反应", () => {
    const block = buildFewShotBlock([
      { id: "a", situation: "夸我", reply: "谢谢", expected: ["谢谢"] },
      { id: "t", situation: "骂我", reply: "连接中断...", expected: ["连接中断"], localOnly: true },
    ]);
    expect(block).toContain("夸我 → 谢谢");
    expect(block).not.toContain("连接中断");
  });

  it("matchesExpected：命中任一关键词；英文不区分大小写", () => {
    expect(matchesExpected("谢谢，我继续了", ["谢谢", "不用谢"])).toBe(true);
    expect(matchesExpected("AI? Really?", ["ai？"])).toBe(true);
    expect(matchesExpected("不客气", ["谢谢"])).toBe(false);
  });

  it("内置样本库结构合法且含终止条目", () => {
    const { samples, warnings } = loadReactionSamples(
      path.join(process.cwd(), "config", "reactions", "samples.json"),
    );
    expect(warnings).toHaveLength(0);
    expect(samples.length).toBeGreaterThanOrEqual(10);
    expect(samples.some((s) => s.localOnly === true)).toBe(true);
  });

  it("写入 reaction-samples 证据产物", () => {
    writeEvidenceLog("reaction-samples.test", ["load/validate; few-shot block; keyword matching"], true);
  });
});
