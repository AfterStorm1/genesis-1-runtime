// Genesis-1 角色运行时骨架 · 契约（附件 A 3.9）
// minimal per handbook; confirm —— 手册未给出独立的 parameter 契约版本常量，
// 由 ParameterDef.contractVersion 与 VALIDATE_AT ParameterRegistry.register 反推。
export const PARAMETER_CONTRACT_VERSION = "1.0.0";

export type ParameterDef =
  | {
      contractVersion: string;
      name: string;
      kind: "number";
      range: [number, number];
      default: number;
      description?: string;
    }
  | {
      contractVersion: string;
      name: string;
      kind: "boolean";
      default: boolean;
      description?: string;
    };

export interface ParameterRegistry {
  register(def: ParameterDef): void;
  unregister(name: string): void;
  has(name: string): boolean;
  clamp(name: string, value: number | boolean): number | boolean;
  list(): ParameterDef[];
}
