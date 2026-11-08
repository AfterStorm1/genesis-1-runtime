// Genesis-1 角色运行时骨架 · VALIDATE_AT 唯一权威表（附录 A / 决策 P0-7、D17）
//
// 规则（铁律 7 / D22 / G-04 / D37）：
// 1. 每个跨层入口必校验版本；表项含 actualPath / mode / payloadShape / sampleFirstFrameOnly / optional。
// 2. 当前无 optional:true 项；A01a 按 22 个非 optional 入口全部至少 1 个可达调用点执行。
// 3. payload 统一「包一层」对象；getByPath 严格点分路径。
// 4. mode:"version" 走 contract.validate；mode:"capabilities" 走 contract.supports。
// 5. sampleFirstFrameOnly 仅 L35.emitFrame；运行期项不进逐帧热路径。
import type { ContractKind, ContractRange, ContractRegistry } from "./versioning";

export type ValidatePhase = "registration" | "runtime";
export type ValidateMode = "version" | "capabilities";

export interface ValidateSpec {
  kind: ContractKind;
  phase: ValidatePhase;
  mode: ValidateMode;
  actualPath: string;
  payloadShape:
    | "signal"
    | "frame"
    | "intent"
    | "fb"
    | "snapshot"
    | "delta"
    | "def"
    | "renderer"
    | "cap"
    | "hook"
    | "source"
    | "input"
    | "output"
    | "ctx"
    | "aggregator";
  sampleFirstFrameOnly?: boolean;
  optional?: boolean;
}

export const VALIDATE_AT: Record<string, ValidateSpec> = {
  "L3.aggregate.output": {
    kind: "expression",
    phase: "runtime",
    mode: "version",
    actualPath: "signal.contractVersion",
    payloadShape: "signal",
  },
  "Aggregator.aggregate": {
    kind: "aggregator",
    phase: "runtime",
    mode: "version",
    actualPath: "ctx.contractVersion",
    payloadShape: "ctx",
  },
  "L3.dispatch": {
    kind: "expression",
    phase: "runtime",
    mode: "version",
    actualPath: "signal.contractVersion",
    payloadShape: "signal",
  },
  "L35.emitFrame": {
    kind: "actuatorFrame",
    phase: "runtime",
    mode: "version",
    actualPath: "frame.contractVersion",
    payloadShape: "frame",
    sampleFirstFrameOnly: true,
  },
  "Scheduler.submit": {
    kind: "spatialIntent",
    phase: "runtime",
    mode: "version",
    actualPath: "intent.contractVersion",
    payloadShape: "intent",
  },
  "Scheduler.submitExpression": {
    kind: "expressionFrameIntent",
    phase: "runtime",
    mode: "version",
    actualPath: "intent.contractVersion",
    payloadShape: "intent",
  },
  "L4.publishFeedback": {
    kind: "feedback",
    phase: "runtime",
    mode: "version",
    actualPath: "fb.contractVersion",
    payloadShape: "fb",
  },
  "InputBus.snapshot": {
    kind: "worldSnapshot",
    phase: "runtime",
    mode: "version",
    actualPath: "snapshot.contractVersion",
    payloadShape: "snapshot",
  },
  "InputBus.onDelta": {
    kind: "worldDelta",
    phase: "runtime",
    mode: "version",
    actualPath: "delta.contractVersion",
    payloadShape: "delta",
  },
  "ToolRegistry.invoke": {
    kind: "toolDefinition",
    phase: "runtime",
    mode: "version",
    actualPath: "def.contractVersion",
    payloadShape: "def",
  },
  "Cognition.onInput": {
    kind: "cognitionIn",
    phase: "runtime",
    mode: "version",
    actualPath: "input.contractVersion",
    payloadShape: "input",
  },
  "Cognition.onInput.output": {
    kind: "cognitionOut",
    phase: "runtime",
    mode: "version",
    actualPath: "output.contractVersion",
    payloadShape: "output",
  },
  "ExpressionSource.emit": {
    kind: "expressionSource",
    phase: "runtime",
    mode: "version",
    actualPath: "source.contractVersion",
    payloadShape: "source",
  },
  "L4.register": {
    kind: "expression",
    phase: "registration",
    mode: "capabilities",
    actualPath: "renderer.capabilities.contractRanges",
    payloadShape: "renderer",
  },
  "L4.registerFrameCapability": {
    kind: "actuatorFrame",
    phase: "registration",
    mode: "version",
    actualPath: "cap.contractVersion",
    payloadShape: "cap",
  },
  "L4.registerFrameCapability.ranges": {
    kind: "actuatorFrame",
    phase: "registration",
    mode: "capabilities",
    actualPath: "cap.contractRanges",
    payloadShape: "cap",
  },
  "L35.attachTrackingSource": {
    kind: "trackingFrame",
    phase: "registration",
    mode: "version",
    actualPath: "source.contractVersion",
    payloadShape: "source",
  },
  "ToolRegistry.register": {
    kind: "toolDefinition",
    phase: "registration",
    mode: "version",
    actualPath: "def.contractVersion",
    payloadShape: "def",
  },
  "ParameterRegistry.register": {
    kind: "parameter",
    phase: "registration",
    mode: "version",
    actualPath: "def.contractVersion",
    payloadShape: "def",
  },
  "PipelineHook.register": {
    kind: "pipelineHook",
    phase: "registration",
    mode: "version",
    actualPath: "hook.contractVersion",
    payloadShape: "hook",
  },
  "ExpressionSource.register": {
    kind: "expressionSource",
    phase: "registration",
    mode: "version",
    actualPath: "source.contractVersion",
    payloadShape: "source",
  },
  "CapabilityLedger.register": {
    kind: "componentCapability",
    phase: "registration",
    mode: "version",
    actualPath: "cap.contractVersion",
    payloadShape: "cap",
  },
};

/** 严格点分路径；中间 undefined 立即返回 undefined（铁律 15 / G-04） */
export function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (seg === "") return undefined;
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

// —— A02 埋点（__validateAt_count）：注册期/运行期分相证据用 ——
const validateAtCounts = new Map<string, number>();

export function __resetValidateAtCounts(): void {
  validateAtCounts.clear();
}

export function __getValidateAtCounts(): ReadonlyMap<string, number> {
  return new Map(validateAtCounts);
}

function recordValidateAt(entry: string): void {
  validateAtCounts.set(entry, (validateAtCounts.get(entry) ?? 0) + 1);
}

export function validateAt(entry: string, payload: unknown, contract: ContractRegistry): void {
  const spec = VALIDATE_AT[entry];
  if (!spec) throw new Error(`unknown_entry:${entry}`);
  const actual = getByPath(payload, spec.actualPath);
  if (actual === undefined) throw new Error(`bad_actual:${entry}`);
  if (spec.mode === "version") {
    contract.validate(spec.kind, actual as string);
    recordValidateAt(entry);
  } else {
    if (!contract.supports(actual as Partial<Record<ContractKind, ContractRange>>)) {
      throw new Error(`capability_unsupported:${entry}`);
    }
    recordValidateAt(entry);
  }
}

/** 仅用于 L35.emitFrame 首帧采样（P0-6 / D46 / P0-R1） */
export class SampledValidator {
  private validated = new Map<string, string>();

  validate(entry: string, payload: unknown, contract: ContractRegistry): void {
    const spec = VALIDATE_AT[entry];
    if (!spec) throw new Error(`unknown_entry:${entry}`);
    if (!spec.sampleFirstFrameOnly) {
      validateAt(entry, payload, contract);
      return;
    }
    const actual = getByPath(payload, spec.actualPath) as string;
    if (actual === undefined) throw new Error(`bad_actual:${entry}`);
    const cached = this.validated.get(entry);
    if (cached === actual) return;
    contract.validate(spec.kind, actual);
    recordValidateAt(entry);
    this.validated.set(entry, actual);
  }

  reset(): void {
    this.validated.clear();
  }
}
