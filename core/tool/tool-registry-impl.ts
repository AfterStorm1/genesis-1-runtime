// Genesis-1 角色运行时骨架 · ToolRegistry 实现（附件 A 3.5 / E-1）
// invoke 强制顺序：查 def（缺失 → tool_not_found）→ version → schema → permission+scope → handler。
// register 内部 validateAt（Q4 确认：impl 内部校验为唯一调用点；compose 不重复）。
import type { JSONSchemaValidator, Principal, ToolDefinition, ToolHandler, ToolInvocation, ToolRegistry, ToolResult } from "../contract/tool";
import type { ContractRegistry } from "../contract/versioning";
import type { SafetyEnforcer } from "../contract/safety";
import { validateAt } from "../contract/entry-points";

export function createToolRegistry(
  safety: SafetyEnforcer,
  contract: ContractRegistry,
  validator: JSONSchemaValidator,
): ToolRegistry {
  const defs = new Map<string, { def: ToolDefinition; handler: ToolHandler }>();

  return {
    register(def: ToolDefinition, handler: ToolHandler): void {
      // 唯一校验调用点（Q4：impl 内部校验；compose 不再前置校验，满足 A02「注册期项每个组件实例只校验一次」）
      validateAt("ToolRegistry.register", { def }, contract);
      if (defs.has(def.name)) {
        throw new Error(`tool_already_registered:${def.name}`);
      }
      defs.set(def.name, { def, handler });
    },
    unregister(name: string): void {
      defs.delete(name);
    },
    list(): ToolDefinition[] {
      return [...defs.values()].map((e) => e.def);
    },
    async invoke(inv: ToolInvocation, principal: Principal): Promise<ToolResult> {
      const entry = defs.get(inv.toolName);
      if (!entry) return { callId: inv.callId, ok: false, error: "tool_not_found" };
      // 1. version
      validateAt("ToolRegistry.invoke", { def: entry.def }, contract);
      // 2. schema
      const vres = validator.validate(entry.def.schema, inv.args);
      if (!vres.ok) {
        return { callId: inv.callId, ok: false, error: "schema_invalid", data: { reason: vres.reason } };
      }
      // 3. permission + scope
      if (!safety.checkToolPermission(principal, entry.def)) {
        return { callId: inv.callId, ok: false, error: "permission_denied" };
      }
      // 4. handler
      try {
        const data = await entry.handler(inv.args, principal);
        return { callId: inv.callId, ok: true, data };
      } catch (err) {
        return {
          callId: inv.callId,
          ok: false,
          error: "handler_error",
          data: { message: err instanceof Error ? err.message : String(err) },
        };
      }
    },
    dispose(): void {
      defs.clear();
    },
  };
}
