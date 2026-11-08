// Genesis-1 角色运行时骨架 · 契约（附件 A 3.5）
export const TOOL_CONTRACT_VERSION = "1.0.0";

export type ToolPermission = "read" | "write" | "execute";

// minimal per handbook; confirm —— 手册未给 JSONSchema 正文；最小子集（type/properties/required/items）
export type JSONSchema = {
  type?: "object" | "string" | "number" | "boolean" | "array" | "null" | string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  [key: string]: unknown;
};

export interface ToolDefinition {
  contractVersion: string;
  name: string;
  description: string;
  schema: JSONSchema;
  permission: ToolPermission;
  scopes: string[];
}

export interface Principal {
  id: string;
  kind: "llm" | "user" | "system" | "renderer";
  runtimeId: string;
  personaId: string;
  grants: ToolPermission[];
  scopes: string[];
}

export interface ToolInvocation {
  toolName: string;
  args: unknown;
  callId: string;
}

export interface ToolResult {
  callId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

// minimal per handbook; confirm —— 手册未给 ToolHandler 正文
export type ToolHandler = (args: unknown, principal: Principal) => unknown | Promise<unknown>;

export interface JSONSchemaValidator {
  validate(schema: JSONSchema, args: unknown): { ok: true } | { ok: false; reason: string };
}

export interface ToolRegistry {
  /** 内部调 validateAt("ToolRegistry.register")（唯一调用点；Q4 确认） */
  register(def: ToolDefinition, handler: ToolHandler): void;
  unregister(name: string): void;
  list(): ToolDefinition[];
  /** 顺序：version → schema → permission+scope → handler */
  invoke(inv: ToolInvocation, principal: Principal): Promise<ToolResult>;
  dispose(): void;
}
