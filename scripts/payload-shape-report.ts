// A01b：payload 形状静态报告（TS Compiler API）
// 每个调用点 payload 含 payloadShape 对应根 key。
// 产物：docs/evidence/payload-shape-report.json
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

// payloadShape → 根 key（铁律 15 / G-04：payload 统一「包一层」）
const SHAPE_TO_KEY: Record<string, string> = {
  signal: "signal",
  frame: "frame",
  intent: "intent",
  fb: "fb",
  snapshot: "snapshot",
  delta: "delta",
  def: "def",
  renderer: "renderer",
  cap: "cap",
  hook: "hook",
  source: "source",
  input: "input",
  output: "output",
  ctx: "ctx",
  aggregator: "aggregator",
};

interface SiteReport {
  entry: string;
  file: string;
  line: number;
  expectedKey: string;
  payloadKeys: string[];
  ok: boolean;
}

function isValidateAtCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee) && callee.text === "validateAt") return true;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "validate") {
    return ts.isIdentifier(callee.expression) && /sampled/i.test(callee.expression.text);
  }
  return false;
}

function collect(filePath: string): SiteReport[] {
  const text = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: SiteReport[] = [];
  const visit = (node: ts.Node): void => {
    if (isValidateAtCall(node)) {
      const call = node as ts.CallExpression;
      const a0 = call.arguments[0];
      const entry = a0 !== undefined && ts.isStringLiteralLike(a0) ? a0.text : null;
      if (entry !== null && entry in VALIDATE_AT) {
        const spec = VALIDATE_AT[entry]!;
        const expectedKey = SHAPE_TO_KEY[spec.payloadShape] ?? spec.payloadShape;
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
        out.push({
          entry,
          file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
          line: pos.line + 1,
          expectedKey,
          payloadKeys,
          ok: payloadKeys.includes(expectedKey),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const sites: SiteReport[] = [];
for (const rel of TARGET_FILES) {
  sites.push(...collect(path.join(ROOT, rel)));
}

const failures = sites.filter((s) => !s.ok);
const pass = failures.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  result: pass ? "local pass" : "LOCAL FAIL",
  ci: "pending / 待 CI",
  sites,
  failures,
  pass,
};

const evidenceDir = path.join(ROOT, "docs", "evidence");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "payload-shape-report.json"), JSON.stringify(report, null, 2), "utf8");

// eslint-disable-next-line no-console
console.log(`scan:payload-shape → pass=${pass} failures=${failures.length}`);
process.exit(pass ? 0 : 1);
