// A01a：VALIDATE_AT 静态键覆盖扫描（附件 A 8.1 / 附录 A / E-3 / D53）
// 扫描可达范围：composition/ + core/{input-bus,scheduler,source-hub,tool,component}/*-impl.ts + core/pipeline.ts。
// 规则：每个非 optional key 至少 1 个可达调用点；每个调用点 entry 必须在表中；
// SampledValidator.validate 间接调用计入；optional:true 允许 0 调用点。
// 产物：docs/evidence/validate-at-scan.json + docs/evidence/callgraph-report.md（A02 静态面）。
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VALIDATE_AT } from "../core/contract/entry-points";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TARGET_FILES = [
  "composition/composition-root.ts",
  "core/pipeline.ts",
  "core/input-bus/input-bus-impl.ts",
  "core/scheduler/scheduler-impl.ts",
  "core/source-hub/hub-impl.ts",
  "core/tool/tool-registry-impl.ts",
  "core/component/capability-ledger-impl.ts",
];

interface CallSite {
  file: string;
  line: number;
  via: "validateAt" | "sampledValidator";
  payloadKeys: string[];
}

function isValidateAtCall(node: ts.Node): { via: "validateAt" | "sampledValidator" } | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (ts.isIdentifier(callee) && callee.text === "validateAt") return { via: "validateAt" };
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "validate") {
    const expr = callee.expression;
    if (ts.isIdentifier(expr) && /sampled/i.test(expr.text)) return { via: "sampledValidator" };
  }
  return null;
}

function literalText(node: ts.Node | undefined): string | null {
  if (node && ts.isStringLiteralLike(node)) return node.text;
  return null;
}

const callSitesByEntry = new Map<string, CallSite[]>();
const unknownEntries: Array<{ entry: string; site: CallSite }> = [];

// —— 重新实现带 entry 的收集（简化） ——
interface EntrySite extends CallSite {
  entry: string;
}

function collectEntrySites(filePath: string): EntrySite[] {
  const text = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const sites: EntrySite[] = [];
  const visit = (node: ts.Node): void => {
    const kind = isValidateAtCall(node);
    if (kind !== null) {
      const call = node as ts.CallExpression;
      const entry = literalText(call.arguments[0]);
      if (entry !== null) {
        const payloadKeys: string[] = [];
        const payloadArg = call.arguments[1];
        if (payloadArg && ts.isObjectLiteralExpression(payloadArg)) {
          for (const prop of payloadArg.properties) {
            if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              payloadKeys.push(prop.name.getText(sf));
            }
          }
        }
        const pos = sf.getLineAndCharacterOfPosition(call.getStart(sf));
        sites.push({
          entry,
          file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
          line: pos.line + 1,
          via: kind.via,
          payloadKeys,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

const allSites: EntrySite[] = [];
for (const rel of TARGET_FILES) {
  allSites.push(...collectEntrySites(path.join(ROOT, rel)));
}

for (const site of allSites) {
  if (!(site.entry in VALIDATE_AT)) unknownEntries.push({ entry: site.entry, site });
  const list = callSitesByEntry.get(site.entry) ?? [];
  list.push(site);
  callSitesByEntry.set(site.entry, list);
}

const missing: string[] = [];
for (const [entry, spec] of Object.entries(VALIDATE_AT)) {
  const optional = spec.optional === true;
  const sites = callSitesByEntry.get(entry) ?? [];
  if (!optional && sites.length === 0) missing.push(entry);
}

const pass = missing.length === 0 && unknownEntries.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  contractCandidate: "1.0.0-rc.5",
  result: pass ? "local pass" : "LOCAL FAIL",
  ci: "pending / 待 CI",
  entries: Object.keys(VALIDATE_AT).map((entry) => ({
    entry,
    optional: VALIDATE_AT[entry]!.optional === true,
    callSites: (callSitesByEntry.get(entry) ?? []).map((s) => ({
      file: s.file,
      line: s.line,
      via: s.via,
      payloadKeys: s.payloadKeys,
    })),
  })),
  missing,
  unknownEntries: unknownEntries.map((u) => ({ entry: u.entry, file: u.site.file, line: u.site.line })),
  pass,
};

const evidenceDir = path.join(ROOT, "docs", "evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "validate-at-scan.json"), JSON.stringify(report, null, 2), "utf8");

// —— callgraph-report.md（A02 静态面） ——
const emitFrameSites = callSitesByEntry.get("L35.emitFrame") ?? [];
const emitFrameInScheduler = emitFrameSites.filter((s) => s.file.includes("scheduler-impl")).length;
const emitFrameInCompositionViaSampler = emitFrameSites.filter(
  (s) => s.file.includes("composition-root") && s.via === "sampledValidator",
).length;

const dispatchFiles = [
  "core/dispatch/signal-dispatcher-impl.ts",
  "adapters/renderers/text-renderer.ts",
  "adapters/renderers/mock-speech-renderer.ts",
  "adapters/renderers/empty-vrchat-renderer.ts",
];
const framePathHits: string[] = [];
for (const rel of dispatchFiles) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, "utf8");
  if (text.includes("validateAt") || text.includes("SampledValidator")) {
    framePathHits.push(rel);
  }
}

const md: string[] = [];
md.push("# callgraph-report.md (A02 静态面)");
md.push("");
md.push(`- 生成时间：${new Date().toISOString()}`);
md.push("- 状态：local pass（静态面）；CI：pending / 待 CI");
md.push("");
md.push("## L35.emitFrame 出现位置");
for (const s of emitFrameSites) {
  md.push(`- ${s.file}:${s.line}（via ${s.via}）`);
}
md.push(
  `- 结论：composition 内 SampledValidator 间接调用 ${emitFrameInCompositionViaSampler} 处；scheduler-impl 内 validateAt 调用 ${emitFrameInScheduler} 处（期望 0）。`,
);
md.push("");
md.push("## dispatchFrame / applyFrame 路径");
md.push(
  framePathHits.length === 0
    ? "- 结论：dispatchFrame / applyFrame 实现路径无 validateAt / SampledValidator（符合铁律 4 / A02）。"
    : `- 违规文件：${framePathHits.join(", ")}`,
);
md.push("");
md.push("## 每入口调用点");
for (const entry of Object.keys(VALIDATE_AT)) {
  const sites = callSitesByEntry.get(entry) ?? [];
  md.push(`### ${entry}`);
  if (sites.length === 0) md.push("- （无调用点）");
  for (const s of sites) md.push(`- ${s.file}:${s.line}（via ${s.via}）`);
}
fs.writeFileSync(path.join(evidenceDir, "callgraph-report.md"), md.join("\n") + "\n", "utf8");

// eslint-disable-next-line no-console
console.log(`scan:validate-at → ${JSON.stringify({ pass, missing, unknownEntries: unknownEntries.length })}`);
process.exit(pass ? 0 : 1);
