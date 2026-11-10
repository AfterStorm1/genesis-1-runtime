// Genesis-1 · 反应样本库（值级）
// 样本 = 情境 → 标准反应 + 验收关键词。两个用途：
//   1. 注入提示词：作为「语气校准」few-shot（buildFewShotBlock）
//   2. 自检评测：LLM 回复是否命中期望关键词（matchesExpected，weekly-check 用）
import fs from "node:fs";

export interface ReactionSample {
  id: string;
  /** 情境/输入 */
  situation: string;
  /** 标准反应示例（few-shot 用） */
  reply: string;
  /** 验收关键词（回复命中任一即通过） */
  expected: string[];
  emotion?: string;
  notes?: string;
  /** 仅本地校验（如终止规则，不经 LLM 评测） */
  localOnly?: boolean;
}

export interface LoadedReactionSamples {
  samples: ReactionSample[];
  warnings: string[];
}

function isValidSample(x: unknown): x is ReactionSample {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.situation === "string" &&
    typeof o.reply === "string" &&
    Array.isArray(o.expected) &&
    o.expected.length > 0 &&
    o.expected.every((e) => typeof e === "string")
  );
}

/** 加载并校验样本库；坏条目跳过并记入 warnings（导出供测试与 weekly-check） */
export function loadReactionSamples(filePath: string): LoadedReactionSamples {
  const warnings: string[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    warnings.push(`无法读取样本库 ${filePath}：${err instanceof Error ? err.message : String(err)}`);
    return { samples: [], warnings };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    warnings.push(`样本库 JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
    return { samples: [], warnings };
  }
  if (!Array.isArray(parsed)) {
    warnings.push("样本库顶层应为数组");
    return { samples: [], warnings };
  }
  const samples: ReactionSample[] = [];
  parsed.forEach((entry, i) => {
    if (isValidSample(entry)) samples.push(entry);
    else warnings.push(`第 ${i + 1} 条样本结构不合法，已跳过`);
  });
  return { samples, warnings };
}

/** 生成 few-shot 注入块（localOnly 条目不进提示词） */
export function buildFewShotBlock(samples: ReactionSample[]): string {
  const lines = samples
    .filter((s) => s.localOnly !== true)
    .map((s) => `- ${s.situation} → ${s.reply}`);
  if (lines.length === 0) return "";
  return `[反应样本——标准反应参考（仅作语气校准，非硬性台词）]\n${lines.join("\n")}`;
}

/** 验收判定：回复包含任一期望关键词（英文不区分大小写） */
export function matchesExpected(reply: string, expected: string[]): boolean {
  const r = reply.toLowerCase();
  return expected.some((k) => k !== "" && r.includes(k.toLowerCase()));
}
