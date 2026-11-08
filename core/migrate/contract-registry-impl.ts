// Genesis-1 角色运行时骨架 · ContractRegistry 实现（附件 A 3.6 / 5.3 / E-1）
// 版本表内置；migrator 纯函数幂等；空表仅校验；开发模式双调用 deep equal 断言。
// 放置说明（偏差清单已记录）：core/migrate/ 承载 ContractRegistry 实现（migrator 表所在地）。
import { EMOTION_CONTRACT_VERSION } from "../contract/emotion";
import { EXPRESSION_CONTRACT_VERSION } from "../contract/expression";
import { ACTUATOR_CONTRACT_VERSION, EXPRESSION_FRAME_INTENT_CONTRACT_VERSION, SPATIAL_CONTRACT_VERSION, TRACKING_CONTRACT_VERSION } from "../contract/spatial";
import { FEEDBACK_CONTRACT_VERSION } from "../contract/feedback";
import { TOOL_CONTRACT_VERSION } from "../contract/tool";
import { COGNITION_CONTRACT_VERSION } from "../contract/cognition";
import { AGGREGATOR_CONTRACT_VERSION } from "../contract/aggregator";
import { PARAMETER_CONTRACT_VERSION } from "../contract/parameter";
import { EXPRESSION_SOURCE_CONTRACT_VERSION } from "../contract/expression-source";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../contract/pipeline-hook";
import { COMPONENT_CAPABILITY_CONTRACT_VERSION } from "../contract/component";
import { WORLD_DELTA_CONTRACT_VERSION, WORLD_SNAPSHOT_CONTRACT_VERSION } from "../contract/perception";
import { compareVersions } from "../contract/versioning";
import type { ContractKind, ContractRange, ContractRegistry } from "../contract/versioning";
import { isProductionBuild } from "../runtime";

const VERSIONS: Record<ContractKind, string> = {
  expression: EXPRESSION_CONTRACT_VERSION,
  actuatorFrame: ACTUATOR_CONTRACT_VERSION,
  trackingFrame: TRACKING_CONTRACT_VERSION,
  feedback: FEEDBACK_CONTRACT_VERSION,
  worldSnapshot: WORLD_SNAPSHOT_CONTRACT_VERSION,
  worldDelta: WORLD_DELTA_CONTRACT_VERSION,
  toolDefinition: TOOL_CONTRACT_VERSION,
  spatialIntent: SPATIAL_CONTRACT_VERSION,
  expressionFrameIntent: EXPRESSION_FRAME_INTENT_CONTRACT_VERSION,
  cognitionIn: COGNITION_CONTRACT_VERSION,
  cognitionOut: COGNITION_CONTRACT_VERSION,
  aggregator: AGGREGATOR_CONTRACT_VERSION,
  parameter: PARAMETER_CONTRACT_VERSION,
  expressionSource: EXPRESSION_SOURCE_CONTRACT_VERSION,
  pipelineHook: PIPELINE_HOOK_CONTRACT_VERSION,
  componentCapability: COMPONENT_CAPABILITY_CONTRACT_VERSION,
};

function inRange(version: string, range: ContractRange): boolean {
  return compareVersions(version, range.min) >= 0 && compareVersions(version, range.max) <= 0;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!(k in (b as object))) return false;
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

export function createContractRegistry(): ContractRegistry {
  const migrators = new Map<string, (old: unknown) => unknown>(); // key: `${from}->${to}`
  const devMode = !isProductionBuild();

  return {
    kinds: Object.keys(VERSIONS) as ContractKind[],
    versionOf(kind: ContractKind): string {
      return VERSIONS[kind];
    },
    validate(kind: ContractKind, actual: string): void {
      const expected = VERSIONS[kind];
      if (actual !== expected) {
        throw new Error(`contract_version_mismatch:${kind}:expected=${expected}:actual=${String(actual)}`);
      }
    },
    supports(capabilityRanges: Partial<Record<ContractKind, ContractRange>>): boolean {
      for (const [kind, range] of Object.entries(capabilityRanges) as Array<[ContractKind, ContractRange]>) {
        const cur = VERSIONS[kind];
        if (cur === undefined) return false;
        if (!inRange(cur, range)) return false;
      }
      return true;
    },
    registerAll(): void {
      // 版本表内置：registerAll 保留入口（契约要求），当前无副作用
    },
    registerMigrator(from: string, to: string, migrate: (old: unknown) => unknown): void {
      migrators.set(`${from}->${to}`, migrate);
    },
    validateAndMigrate(kind: ContractKind, actual: string, payload: unknown): unknown {
      const expected = VERSIONS[kind];
      let cur = actual;
      let data = payload;
      if (cur !== expected) {
        const migrate = migrators.get(`${cur}->${expected}`);
        if (migrate === undefined) {
          // 无迁移表项：仅校验（跨大版本显式注册，禁止隐式兜底）
          this.validate(kind, actual);
          return payload;
        }
        if (devMode) {
          // 开发模式：双调用 deep equal 断言幂等（5.3）
          const a = migrate(data);
          const b = migrate(data);
          if (!deepEqual(a, b)) {
            throw new Error(`migrator_not_idempotent:${kind}:${cur}->${expected}`);
          }
          data = a;
        } else {
          data = migrate(data);
        }
        cur = expected;
      }
      this.validate(kind, cur);
      return data;
    },
  };
}
