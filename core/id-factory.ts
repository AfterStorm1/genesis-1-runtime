// Genesis-1 角色运行时骨架 · 全局唯一 id（铁律 12 / D28）
// 补充实现文件：手册树未列，但 id 格式校验为 Arbiter.submit 强制项，需单点实现。
import { randomUUID } from "node:crypto";

export interface IdFactory {
  next(): string;
}

/** runtimeId:sourceId:monotonic */
export function createIdFactory(runtimeId: string, sourceId: string): IdFactory {
  let monotonic = 0;
  return {
    next(): string {
      monotonic += 1;
      return `${runtimeId}:${sourceId}:${monotonic}`;
    },
  };
}

// runtimeId:sourceId:monotonic —— runtimeId/sourceId 本身可含冒号（如 "rt:e2e"），
// 因此只要求：至少一个冒号、末段为单调递增正整数。
const TRIPLE_ID = /^.+:[1-9][0-9]*$/;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 仅接受 runtimeId:sourceId:monotonic 或 UUIDv7；禁「时间戳+随机数」（铁律 12） */
export function isValidGlobalId(id: string): boolean {
  return TRIPLE_ID.test(id) || UUID_V7.test(id);
}

/** 简化 UUIDv7：randomUUID 改写版本位(7)与变体位(10xx)。骨架交付；非密码学用途。 */
export function createUuidV7(): string {
  const u = randomUUID();
  return `${u.slice(0, 14)}7${u.slice(15, 19)}a${u.slice(20)}`;
}
