// Genesis-1 角色运行时骨架 · 契约（附件 A 3.1）
declare const MOTION_KEY_BRAND: unique symbol;

/** 强校验运动键（D15）：注册表 resolve 校验；aggregator 对非法 key 整批失败 */
export type MotionKey = string & { readonly [MOTION_KEY_BRAND]: true };

export interface MotionDef {
  key: string;
  durationMs?: number;
  interruptible: boolean;
  fallback?: string;
}

export interface MotionRegistry {
  register(def: MotionDef): void;
  has(key: string): boolean;
  asMotionKey(key: string): MotionKey;
  resolve(key: MotionKey): MotionDef | undefined;
  list(): MotionDef[];
}
