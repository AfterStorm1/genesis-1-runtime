// Genesis-1 角色运行时骨架 · 默认 JSONSchemaValidator（附件 A 3.5 / S-05）
// minimal per handbook; confirm —— 最小子集：type / required / items；骨架交付。
import type { JSONSchema, JSONSchemaValidator } from "../contract/tool";

export function createDefaultJSONSchemaValidator(): JSONSchemaValidator {
  return {
    validate(schema: JSONSchema, args: unknown): { ok: true } | { ok: false; reason: string } {
      const t = schema.type;
      if (t === undefined) return { ok: true };
      switch (t) {
        case "object": {
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            return { ok: false, reason: "expected object" };
          }
          for (const key of schema.required ?? []) {
            if (!(key in (args as Record<string, unknown>))) {
              return { ok: false, reason: `missing required:${key}` };
            }
          }
          return { ok: true };
        }
        case "array": {
          if (!Array.isArray(args)) return { ok: false, reason: "expected array" };
          if (schema.items !== undefined) {
            for (const item of args) {
              const r = this.validate(schema.items, item);
              if (!r.ok) return r;
            }
          }
          return { ok: true };
        }
        case "string":
          return typeof args === "string" ? { ok: true } : { ok: false, reason: "expected string" };
        case "number":
          return typeof args === "number" && Number.isFinite(args)
            ? { ok: true }
            : { ok: false, reason: "expected number" };
        case "boolean":
          return typeof args === "boolean" ? { ok: true } : { ok: false, reason: "expected boolean" };
        case "null":
          return args === null ? { ok: true } : { ok: false, reason: "expected null" };
        default:
          // 未知 type 关键字：放行（minimal；骨架不实现完整 JSON Schema）
          return { ok: true };
      }
    },
  };
}
