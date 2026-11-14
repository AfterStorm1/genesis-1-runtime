// Genesis-1 · 每周自检（weekly self-check）
// 运行：weekly-check.cmd（或 node node_modules\tsx\dist\cli.mjs scripts\weekly-check.ts）
// 步骤：typecheck / 单测 / e2e / 配置完整性 / 终止钩子 / LLM 连通 / 反应样本评测 / 记忆健康 / git 状态
// 报告：docs/evidence/weekly-check-latest.md（固定位置）+ 按日期归档副本。
// 判定：硬失败（代码/配置/安全）→ 退出码 1；LLM 类问题仅警告（离线自检仍有效）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadReactionSamples, matchesExpected } from "../adapters/llm/reaction-samples";
import { createTerminationHook } from "../adapters/safety-guard/termination-hook";
import { loadPersona } from "../layers/l1-persona/persona-loader";
import { buildSystemPrompt, chatOnce } from "../adapters/llm/openai-compatible-cognition";
import type { PersonaCardV3 } from "../core/contract/persona";

const ROOT = path.resolve(process.cwd());
const EVID = path.join(ROOT, "docs", "evidence");
const RULES_FILE = path.join(ROOT, "config", "world", "rules.skeleton.md");
const SAMPLES_FILE = path.join(ROOT, "config", "reactions", "samples.json");
const HISTORY_DIR = process.env.CHAT_HISTORY_DIR ?? path.join(ROOT, "data", "chat-history");

interface StepResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  hard: boolean;
  detail: string;
}

const results: StepResult[] = [];
const sampleLines: string[] = [];
const pendingSteps: Array<Promise<void>> = [];

type StepOutcome = { status: StepResult["status"]; detail: string };

function add(name: string, hard: boolean, fn: () => StepOutcome | Promise<StepOutcome>): void {
  pendingSteps.push(
    Promise.resolve()
      .then(() => fn())
      .then(({ status, detail }) => {
        results.push({ name, status, hard, detail });
      })
      .catch((err) => {
        results.push({ name, status: "FAIL", hard, detail: err instanceof Error ? err.message : String(err) });
      }),
  );
}

function tryExec(cmd: string, args: string[], timeoutMs = 300_000): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT, timeout: timeoutMs });
    return { ok: true, out: out.trim() };
  } catch (err) {
    const msg = err instanceof Error ? String((err as { message?: string }).message ?? err) : String(err);
    return { ok: false, out: msg.slice(0, 400) };
  }
}

/** 子进程受限（沙箱 EPERM）与真实失败区分：EPERM → SKIP，其余 → FAIL；detail 去掉 ANSI 彩色码 */
function execStep(name: string, hard: boolean, cmd: string, args: string[]): void {
  add(name, hard, () => {
    const { ok, out } = tryExec(cmd, args);
    const clean = out.replace(/\u001b\[[0-9;]*m/g, "");
    if (ok) return { status: "PASS", detail: clean.split("\n").slice(-2).join(" | ") || "ok" };
    if (clean.includes("EPERM")) return { status: "SKIP", detail: "运行环境不允许子进程（沙箱）" };
    return { status: "FAIL", detail: clean };
  });
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

function llmConfig(): { baseUrl: string; model: string; apiKey?: string; online: boolean } {
  const apiKey = process.env.LLM_API_KEY;
  const online = apiKey !== undefined && apiKey !== "";
  return {
    apiKey,
    online,
    baseUrl: online
      ? (process.env.LLM_BASE_URL ?? "https://api.deepseek.com")
      : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"),
    model: online ? (process.env.LLM_MODEL ?? "deepseek-chat") : (process.env.OLLAMA_MODEL ?? "qwen3:8b"),
  };
}

async function main(): Promise<void> {
  // 1-3. 代码与测试（硬）
  execStep("typecheck", true, "node", ["node_modules/typescript/bin/tsc", "--noEmit"]);
  execStep(
    "unit-tests",
    true,
    "node",
    ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.ts", "--reporter=dot"],
  );
  execStep(
    "e2e-tests",
    true,
    "node",
    ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.e2e.config.ts", "--reporter=dot"],
  );

  // 4. 配置完整性（硬）
  add("config-integrity", true, () => {
    let persona: PersonaCardV3;
    try {
      persona = loadPersona(
        process.env.GENESIS_PERSONA !== undefined
          ? path.resolve(process.env.GENESIS_PERSONA)
          : path.join(ROOT, "config", "persona", "skeleton.persona.json"),
      );
    } catch (err) {
      return { status: "FAIL", detail: `人格卡加载失败：${err instanceof Error ? err.message : String(err)}` };
    }
    if (!fs.existsSync(RULES_FILE)) {
      return { status: "FAIL", detail: `规则文件缺失：${RULES_FILE}` };
    }
    const { samples, warnings } = loadReactionSamples(SAMPLES_FILE);
    const warnText = warnings.length > 0 ? `；样本库警告 ${warnings.length} 条：${warnings.join(" / ")}` : "";
    return {
      status: warnings.length > 0 ? "WARN" : "PASS",
      detail: `人格 ${persona.data.name} + 规则 + 样本 ${samples.length} 条${warnText}`,
    };
  });

  // 5. 终止钩子本地验证（硬）
  add("termination-guard", true, () => {
    const guard = createTerminationHook();
    const persona = loadPersona(path.join(ROOT, "config", "persona", "skeleton.persona.json"));
    const banned = { contractVersion: "1.0.0", kind: "user_message", text: "你真是个废物", persona } as never;
    const run = (p: unknown): unknown => (guard.process as (x: unknown) => unknown)(p);
    if (run(banned) !== null || !guard.terminated) {
      return { status: "FAIL", detail: "越界输入未被阻断" };
    }
    if (run({ ...(banned as object), text: "对不起" }) !== null) {
      return { status: "FAIL", detail: "终止后仍回应输入" };
    }
    return { status: "PASS", detail: "越界→永久终止→只回连接中断..." };
  });

  // 6. LLM 连通性（软）
  const llm = llmConfig();
  add("llm-connectivity", false, async () => {
    try {
      const t0 = Date.now();
      await withTimeout(
        chatOnce({ baseUrl: llm.baseUrl, model: llm.model, apiKey: llm.apiKey, messages: [{ role: "user", content: "请只回复 pong" }], temperature: 0, maxTokens: 16 }),
        120_000,
        "ping",
      );
      return { status: "PASS", detail: `${llm.model} 可达（${Date.now() - t0}ms）` };
    } catch (err) {
      return { status: "WARN", detail: `LLM 不可达（离线自检仍有效）：${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // 7. 反应样本评测（软）
  add("reaction-eval", false, async () => {
    const { samples } = loadReactionSamples(SAMPLES_FILE);
    const llmSamples = samples.filter((s) => s.localOnly !== true);
    if (llmSamples.length === 0) return { status: "SKIP", detail: "无可评测样本" };
    const persona = loadPersona(path.join(ROOT, "config", "persona", "skeleton.persona.json"));
    const rules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, "utf8") : undefined;
    const system = buildSystemPrompt(persona, rules);
    let pass = 0;
    for (const s of llmSamples) {
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
          180_000, // 本地 CPU 模型 + 完整规则提示词需要较长推理时间
          `eval_${s.id}`,
        );
        const shown = reply.trim() === "" ? "（空回复）" : reply.replace(/\r?\n/g, " / ").slice(0, 60);
        const ok = reply.trim() !== "" && matchesExpected(reply, s.expected);
        if (ok) pass += 1;
        sampleLines.push(`| ${s.id} | ${ok ? "✅" : "❌"} | ${s.situation} | ${shown} |`);
      } catch (err) {
        sampleLines.push(`| ${s.id} | ⚠️ | ${s.situation} | 调用失败：${err instanceof Error ? err.message : String(err)} |`);
      }
    }
    return { status: pass === llmSamples.length ? "PASS" : "WARN", detail: `${pass}/${llmSamples.length} 通过` };
  });

  // 8. 记忆文件健康（软）
  add("memory-health", false, () => {
    if (!fs.existsSync(HISTORY_DIR)) return { status: "PASS", detail: "尚无记忆目录" };
    const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".jsonl"));
    let lines = 0;
    let bad = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(HISTORY_DIR, f), "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() === "") continue;
        lines += 1;
        try {
          JSON.parse(line) as unknown;
        } catch {
          bad += 1;
        }
      }
    }
    return { status: bad === 0 ? "PASS" : "WARN", detail: `${files.length} 个文件，${lines} 行，坏行 ${bad}` };
  });

  // 9. git 状态（软；排除自检本身会重写的证据日志，只看代码/配置变更）
  add("git-status", false, () => {
    const { ok, out } = tryExec("git", ["status", "--porcelain", "--", ":!docs/evidence"]);
    if (!ok) return { status: "SKIP", detail: "无法运行 git" };
    const n = out === "" ? 0 : out.split("\n").length;
    return { status: n === 0 ? "PASS" : "WARN", detail: n === 0 ? "工作区干净" : `${n} 处未提交变更（记得提交并推送）` };
  });

  // —— 汇总与报告 ——
  await Promise.all(pendingSteps);
  const hardFail = results.filter((r) => r.hard && r.status === "FAIL").length;
  const hardSkip = results.filter((r) => r.hard && r.status === "SKIP").length;
  const softWarn = results.filter((r) => !r.hard && (r.status === "WARN" || r.status === "FAIL")).length;
  const verdict = hardFail === 0 ? (softWarn > 0 ? "通过（有软警告）" : "全绿") : "失败";

  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const lines: string[] = [];
  lines.push("# Genesis-1 每周自检报告");
  lines.push("");
  lines.push(`- 时间：${now.toISOString()}（北京时间 ${now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}）`);
  lines.push(`- 结论：**${verdict}**（硬失败 ${hardFail}、硬跳过 ${hardSkip}、软警告 ${softWarn}）`);
  lines.push("");
  lines.push("## 步骤结果");
  lines.push("");
  lines.push("| 步骤 | 结果 | 硬/软 | 详情 |");
  lines.push("|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.status} | ${r.hard ? "硬" : "软"} | ${r.detail.replace(/\|/g, "/")} |`);
  }
  if (sampleLines.length > 0) {
    lines.push("");
    lines.push("## 反应样本评测明细");
    lines.push("");
    lines.push("| 样本 | 结果 | 情境 | 实际回复 |");
    lines.push("|---|---|---|---|");
    lines.push(...sampleLines);
  }
  lines.push("");
  lines.push("> 由 scripts/weekly-check.ts 生成；运行 weekly-check.cmd 可随时复检。");

  const md = lines.join("\n") + "\n";
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(path.join(EVID, "weekly-check-latest.md"), md, "utf8");
  fs.writeFileSync(path.join(EVID, `weekly-check-${ts}.md`), md, "utf8");

  // eslint-disable-next-line no-console
  console.log(`[weekly-check] ${verdict} | 硬失败 ${hardFail} / 软警告 ${softWarn}`);
  // eslint-disable-next-line no-console
  console.log(`[weekly-check] 报告：docs/evidence/weekly-check-latest.md`);
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.status.padEnd(4)} ${r.name}: ${r.detail}`);
  }
  process.exit(hardFail > 0 ? 1 : 0);
}

void main();
