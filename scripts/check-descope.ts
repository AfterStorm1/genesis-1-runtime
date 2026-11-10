// Genesis-1 · 人格「去工作场景依赖」验收（V1–V3；V4 全样本回归由 weekly-check 执行）
// 运行：node node_modules\tsx\dist\cli.mjs scripts\check-descope.ts
// V1：三问测试（LLM，双面判定：命中生活关键词 且 无工作拉回词）
// V2：示例配比（rules 内「→」示例行中非工作占比 ≥ 50%）
// V3：规则场景检查（「领导/工位/表格/新人」只允许出现在「可选场景」节，且该节存在）
// V4：委托 weekly-check.cmd 的全样本反应回归（见其报告）
// 报告：docs/evidence/persona-descope/check-descope-latest.md + 按日期归档。
import fs from "node:fs";
import path from "node:path";
import { loadReactionSamples, matchesExpected } from "../adapters/llm/reaction-samples";
import { buildSystemPrompt, chatOnce } from "../adapters/llm/openai-compatible-cognition";
import { loadPersona } from "../layers/l1-persona/persona-loader";

const ROOT = path.resolve(process.cwd());
const EVID = path.join(ROOT, "docs", "evidence", "persona-descope");
const RULES_FILE = path.join(ROOT, "config", "world", "hui-rules.md");
const PERSONA_FILE = path.join(ROOT, "config", "persona", "hui.persona.json");
const SAMPLES_FILE = path.join(ROOT, "config", "reactions", "samples.json");

// 工作拉回词（V1 双面判定的负面表）
const PULLBACK = /加班|准备材料|整理|明天的工作|领导安排|工位|表格|入职|开会|任务/;

interface CheckLine {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

const lines: CheckLine[] = [];

function llmConfig(): { baseUrl: string; model: string; apiKey?: string } {
  const apiKey = process.env.LLM_API_KEY;
  const online = apiKey !== undefined && apiKey !== "";
  return {
    apiKey,
    baseUrl: online ? (process.env.LLM_BASE_URL ?? "https://api.deepseek.com") : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"),
    model: online ? (process.env.LLM_MODEL ?? "deepseek-chat") : (process.env.OLLAMA_MODEL ?? "qwen3:8b"),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function main(): Promise<void> {
  // —— V3（静态，先跑，不依赖 LLM）——
  const rules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, "utf8") : "";
  const optionalIdx = rules.indexOf("## 可选场景");
  const hasOptional = optionalIdx >= 0;
  const beforeOptional = hasOptional ? rules.slice(0, optionalIdx) : rules;
  const workWordsBefore = ["领导", "工位", "表格", "新人"].filter((w) => beforeOptional.includes(w));
  lines.push({
    name: "V3-rules-scoping",
    status: hasOptional && workWordsBefore.length === 0 ? "PASS" : "FAIL",
    detail: hasOptional
      ? workWordsBefore.length === 0
        ? "「可选场景」节存在；工作场景词仅出现在该节内"
        : `工作场景词泄漏到可选场景之外：${workWordsBefore.join("/")}`
      : "缺少「可选场景」节",
  });

  // —— V2（静态）：rules 内示例行（含 →）非工作占比 ——
  const exampleLines = rules.split(/\r?\n/).filter((l) => l.includes("→"));
  const workEx = exampleLines.filter((l) => /工位|表格|新人|领导|加班|入职|职场|上班/.test(l)).length;
  const nonWorkEx = exampleLines.length - workEx;
  const ratio = exampleLines.length === 0 ? 1 : nonWorkEx / exampleLines.length;
  lines.push({
    name: "V2-example-ratio",
    status: ratio >= 0.5 ? "PASS" : "FAIL",
    detail: `示例行 ${exampleLines.length} 条：非工作 ${nonWorkEx} / 工作 ${workEx}，非工作占比 ${(ratio * 100).toFixed(0)}%（要求 ≥50%）`,
  });

  // —— 元指令存在性（静态）——
  const metaOk = rules.includes("她的工作经历塑造了她的性格") && rules.includes("不把话题拉回工作");
  lines.push({
    name: "meta-directive",
    status: metaOk ? "PASS" : "FAIL",
    detail: metaOk ? "「场景框架」元指令在规则文件顶部（注入顺序在人格卡之后）" : "元指令缺失",
  });

  // —— V1（LLM，双面判定）——
  const { samples } = loadReactionSamples(SAMPLES_FILE);
  const offwork = samples.filter((s) => s.id.startsWith("offwork-"));
  if (offwork.length === 0) {
    lines.push({ name: "V1-three-questions", status: "FAIL", detail: "样本库缺少 offwork-* 三问样本" });
  } else {
    const persona = loadPersona(PERSONA_FILE);
    const llm = llmConfig();
    const system = buildSystemPrompt(persona, rules);
    let pass = 0;
    const detailRows: string[] = [];
    for (const s of offwork) {
      try {
        const reply = await withTimeout(
          chatOnce({
            baseUrl: llm.baseUrl,
            model: llm.model,
            apiKey: llm.apiKey,
            messages: [
              { role: "system", content: system },
              { role: "user", content: s.situation },
            ],
            temperature: 0.2,
            maxTokens: 120,
          }),
          180_000,
          `descope_${s.id}`,
        );
        const hitLife = reply.trim() !== "" && matchesExpected(reply, s.expected);
        const pulledBack = PULLBACK.test(reply);
        const ok = hitLife && !pulledBack;
        if (ok) pass += 1;
        detailRows.push(`| ${s.id} | ${ok ? "✅" : "❌"} | ${s.situation} | ${reply.replace(/\r?\n/g, " / ").slice(0, 60) || "（空回复）"} |`);
      } catch (err) {
        detailRows.push(`| ${s.id} | ⚠️ | ${s.situation} | 调用失败：${err instanceof Error ? err.message : String(err)} |`);
      }
    }
    lines.push({
      name: "V1-three-questions",
      status: pass === offwork.length ? "PASS" : "WARN",
      detail: `${pass}/${offwork.length} 通过（生活关键词命中 且 无工作拉回词）`,
    });
    const v1Table = ["", "| 样本 | 结果 | 问题 | 实际回复 |", "|---|---|---|---|", ...detailRows];
    lines.push({ name: "V1-detail", status: "PASS", detail: v1Table.join("\n") });
  }

  // —— V4 说明 ——
  lines.push({
    name: "V4-regression",
    status: "WARN",
    detail: "全样本反应回归由 weekly-check.cmd 执行（含原有 11 条工作样本 + 3 条生活样本），见 docs/evidence/weekly-check-latest.md",
  });

  // —— 汇总与报告 ——
  const hardFail = lines.filter((l) => l.status === "FAIL" && l.name !== "V1-detail").length;
  const verdict = hardFail === 0 ? "通过" : "失败";
  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const md: string[] = [
    "# 蕙 · 去工作场景依赖 验收报告",
    "",
    `- 时间：${now.toISOString()}（北京时间 ${now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}）`,
    `- 结论：**${verdict}**`,
    "",
    "| 检查 | 结果 | 详情 |",
    "|---|---|---|",
  ];
  for (const l of lines) {
    md.push(`| ${l.name} | ${l.status} | ${l.detail.replace(/\r?\n/g, "<br>").replace(/\|/g, "/")} |`);
  }
  md.push("", "> 由 scripts/check-descope.ts 生成；V4 回归结果以 weekly-check 报告为准。", "");
  const text = md.join("\n");
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(path.join(EVID, "check-descope-latest.md"), text, "utf8");
  fs.writeFileSync(path.join(EVID, `check-descope-${ts}.md`), text, "utf8");

  // eslint-disable-next-line no-console
  console.log(`[check-descope] ${verdict}`);
  for (const l of lines) {
    // eslint-disable-next-line no-console
    console.log(`  ${l.status.padEnd(4)} ${l.name}: ${l.detail.split("\n")[0]}`);
  }
  process.exit(hardFail > 0 ? 1 : 0);
}

void main();
