// ToolRegistry：invoke 顺序 version → schema → permission+scope → handler（附件 A 3.5）
import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "../../core/tool/tool-registry-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { createSafetyEnforcer } from "../../core/safety/safety-enforcer-impl";
import { mergeSafetyDefaults } from "../../core/safety/merge";
import { createParameterRegistry } from "../../core/parameter/parameter-registry-impl";
import { createDefaultJSONSchemaValidator } from "../../core/schema/default-json-schema-validator";
import type { Principal } from "../../core/contract/tool";

const contract = createContractRegistry();
const safety = createSafetyEnforcer(mergeSafetyDefaults({}).merged, createParameterRegistry());
const validator = createDefaultJSONSchemaValidator();

const def = {
  contractVersion: "1.0.0",
  name: "echo",
  description: "echo tool",
  schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  permission: "read" as const,
  scopes: ["chat"],
};

const principal: Principal = {
  id: "llm:rt:t:p",
  kind: "llm",
  runtimeId: "rt:t",
  personaId: "p",
  grants: ["read"],
  scopes: ["chat"],
};

describe("tool registry", () => {
  it("invoke 顺序：version → schema → permission+scope → handler", async () => {
    const order: string[] = [];
    const registry = createToolRegistry(
      {
        ...safety,
        checkToolPermission: (p, d) => {
          order.push("permission");
          return safety.checkToolPermission(p, d);
        },
      },
      contract,
      {
        validate: (schema, args) => {
          order.push("schema");
          return validator.validate(schema, args);
        },
      },
    );
    registry.register(def, async () => {
      order.push("handler");
      return "ok";
    });
    const res = await registry.invoke({ toolName: "echo", args: { text: "hi" }, callId: "c1" }, principal);
    expect(res.ok).toBe(true);
    expect(order).toEqual(["schema", "permission", "handler"]); // version 先行（无可见副作用）
  });

  it("缺失 tool → tool_not_found", async () => {
    const registry = createToolRegistry(safety, contract, validator);
    const res = await registry.invoke({ toolName: "nope", args: {}, callId: "c1" }, principal);
    expect(res).toEqual({ callId: "c1", ok: false, error: "tool_not_found" });
  });

  it("schema 失败 → schema_invalid", async () => {
    const registry = createToolRegistry(safety, contract, validator);
    registry.register(def, async () => "ok");
    const res = await registry.invoke({ toolName: "echo", args: { nope: 1 }, callId: "c1" }, principal);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("schema_invalid");
  });

  it("权限失败 → permission_denied", async () => {
    const registry = createToolRegistry(safety, contract, validator);
    registry.register(def, async () => "ok");
    const noGrant: Principal = { ...principal, grants: [] };
    const res = await registry.invoke({ toolName: "echo", args: { text: "hi" }, callId: "c1" }, noGrant);
    expect(res.error).toBe("permission_denied");
    const noScope: Principal = { ...principal, scopes: [] };
    const res2 = await registry.invoke({ toolName: "echo", args: { text: "hi" }, callId: "c2" }, noScope);
    expect(res2.error).toBe("permission_denied");
  });

  it("handler 异常 → handler_error", async () => {
    const registry = createToolRegistry(safety, contract, validator);
    registry.register(def, async () => {
      throw new Error("boom");
    });
    const res = await registry.invoke({ toolName: "echo", args: { text: "hi" }, callId: "c1" }, principal);
    expect(res.error).toBe("handler_error");
  });

  it("坏版本 def → 注册期拒绝（impl 内部 validateAt 唯一调用点）", () => {
    const registry = createToolRegistry(safety, contract, validator);
    expect(() => registry.register({ ...def, contractVersion: "0.1.0" }, async () => {})).toThrow(
      /contract_version_mismatch:toolDefinition/,
    );
  });

  it("重复注册同名拒绝", () => {
    const registry = createToolRegistry(safety, contract, validator);
    registry.register(def, async () => {});
    expect(() => registry.register(def, async () => {})).toThrow(/tool_already_registered/);
  });

  it("unregister / list", () => {
    const registry = createToolRegistry(safety, contract, validator);
    registry.register(def, async () => {});
    expect(registry.list()).toHaveLength(1);
    registry.unregister("echo");
    expect(registry.list()).toHaveLength(0);
  });

  it("spy 兜底：调用顺序不被 handler 重排", async () => {
    const spy = vi.fn();
    const registry = createToolRegistry(
      { ...safety, checkToolPermission: (p, d) => { spy("perm"); return safety.checkToolPermission(p, d); } },
      contract,
      { validate: (s, a) => { spy("schema"); return validator.validate(s, a); } },
    );
    registry.register(def, async () => {
      spy("handler");
    });
    await registry.invoke({ toolName: "echo", args: { text: "x" }, callId: "c" }, principal);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["schema", "perm", "handler"]);
  });
});
