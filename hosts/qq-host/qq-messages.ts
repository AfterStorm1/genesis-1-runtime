// Genesis-1 · QQ 群消息解析与语音文件定位（从 qq-bot.ts 拆出的纯工具层，值级）
import fs from "node:fs";
import path from "node:path";

export type OwnerCommand = "reset" | "clear" | "status";

/** 好友每日首次问候判定（导出供测试）：今天还没打过招呼 → true */
export function shouldGreetFriend(lastDate: string | undefined, today: string): boolean {
  return lastDate !== today;
}

/** 管理指令解析（导出供测试）：!reset 重置本群 / !clear 清记忆 / !status 查状态 */
export function parseOwnerCommand(text: string): OwnerCommand | null {
  const t = text.trim().toLowerCase();
  if (t === "!reset") return "reset";
  if (t === "!clear") return "clear";
  if (t === "!status") return "status";
  return null;
}

export interface OneBotGroupEvent {
  post_type?: string;
  message_type?: string;
  group_id?: number;
  user_id?: number;
  self_id?: number;
  raw_message?: string;
  message?:
    | string
    | Array<{ type?: string; data?: { qq?: string | number; text?: string; file?: string; path?: string; url?: string } }>;
}

/** 是否群消息事件（导出供测试） */
export function isGroupMessage(ev: unknown): ev is OneBotGroupEvent {
  if (typeof ev !== "object" || ev === null) return false;
  const o = ev as OneBotGroupEvent;
  return o.post_type === "message" && o.message_type === "group";
}

/** 清洗 CQ 码（表情/图片/at 等）为纯文本（导出供测试） */
export function stripCqCodes(text: string): string {
  return text.replace(/\[CQ:[^\]]*\]/g, "").trim();
}

/** 从 CQ 码提取引用消息 id（导出供测试）；如 [CQ:reply,id=12345] */
export function extractCqReply(raw: string): string | null {
  const m = raw.match(/\[CQ:reply,id=([^\],\s]+)/);
  return m !== null && m[1] !== undefined ? m[1].trim() : null;
}

/** 从 CQ 码提取图片 url（导出供测试）；如 [CQ:image,file=xx,url=http://...] */
export function extractCqImageUrl(raw: string): string | null {
  const m = raw.match(/\[CQ:image,[^\]]*url=([^\],\s]+)/);
  return m !== null && m[1] !== undefined ? m[1].trim() : null;
}

/** 从 CQ 码提取指定类型的 file 路径（导出供测试）；如语音 [CQ:record,file=xxx] */
export function extractCqFile(raw: string, type: string): string | null {
  const m = raw.match(new RegExp(`\\[CQ:${type},file=([^,\\]]+)`));
  return m !== null && m[1] !== undefined ? m[1].trim() : null;
}

export interface RecordInfo {
  file?: string;
  path?: string;
  url?: string;
}

/** 提取语音消息的完整信息：优先 message 数组段，兜底解析 raw CQ 码（导出供测试） */
export function extractCqRecord(ev: OneBotGroupEvent): RecordInfo | null {
  if (Array.isArray(ev.message)) {
    for (const m of ev.message) {
      if (m.type === "record" && m.data !== undefined) {
        const d = m.data as { file?: unknown; path?: unknown; url?: unknown };
        return {
          file: typeof d.file === "string" ? d.file : undefined,
          path: typeof d.path === "string" ? d.path : undefined,
          url: typeof d.url === "string" ? d.url : undefined,
        };
      }
    }
  }
  const raw = ev.raw_message ?? "";
  const m = raw.match(/\[CQ:record,([^\]]*)\]/);
  if (m === null) return null;
  const get = (k: string): string | undefined => {
    const f = m[1]!.match(new RegExp(`(?:^|,)${k}=([^,\\]]+)`));
    return f?.[1] ?? undefined;
  };
  const file = get("file");
  return { file, path: get("path"), url: get("url") };
}

/** 在候选根目录里定位语音文件（路径优先；file 相对名逐层搜索，深度上限 6）（导出供测试） */
export function resolveRecordFile(rec: RecordInfo, roots: string[]): string | null {
  if (rec.path !== undefined && fs.existsSync(rec.path)) return rec.path;
  if (rec.file !== undefined) {
    if (path.isAbsolute(rec.file) && fs.existsSync(rec.file)) return rec.file;
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const direct = path.join(root, rec.file);
      if (fs.existsSync(direct)) return direct;
    }
    for (const root of roots) {
      const found = searchFile(root, rec.file, 6);
      if (found !== null) return found;
    }
  }
  return null;
}

function searchFile(dir: string, name: string, depth: number): string | null {
  if (depth <= 0 || !fs.existsSync(dir)) return null;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const hit = searchFile(p, name, depth - 1);
        if (hit !== null) return hit;
      } else if (e.name === name) {
        return p;
      }
    }
  } catch {
    /* 无权限目录跳过 */
  }
  return null;
}

/** 轮询等待文件落盘（NapCat 事件可能先于下载完成到达）（导出供测试） */
export async function resolveRecordWithRetry(
  rec: RecordInfo,
  roots: string[],
  timeoutMs = 15_000,
  pollMs = 300,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = resolveRecordFile(rec, roots);
    if (hit !== null) return hit;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** 从 QQ CDN url 下载语音到本地（路径缺失时的兜底）（导出供测试） */
export async function downloadRecord(url: string, outPath: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`record_download_http_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return outPath;
}

/**
 * 从群事件提取应回复的文本：被 @ 或触发词开头才返回非 null（导出供测试）。
 * 返回值为清洗后的用户文本（去掉 @ 段与触发词）。
 */
export function extractUserText(ev: OneBotGroupEvent, selfId: number, trigger: string): string | null {
  const raw = ev.raw_message ?? (Array.isArray(ev.message) ? ev.message.map((m) => m.data?.text ?? "").join("") : ev.message ?? "");
  const mentioned =
    Array.isArray(ev.message) && ev.message.some((m) => m.type === "at" && String(m.data?.qq) === String(selfId));
  let body = stripCqCodes(raw).trim();
  if (body === "") return null;
  if (!mentioned) {
    // 字面 @（有些客户端 @ 只产生纯文本）也视为提及；
    // 或消息里出现触发词（不要求是第一个字）即触发，并把触发词从文本中去掉
    body = body.replace(/^[@＠]\s*/, "");
    if (!body.includes(trigger)) return null;
    body = body.split(trigger).join("");
  }
  const text = stripCqCodes(body).trim();
  return text === "" ? null : text;
}

/** 超长回复分条（导出供测试） */
export function splitForSend(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    parts.push(rest.slice(0, maxLen));
    rest = rest.slice(maxLen);
  }
  if (rest !== "") parts.push(rest);
  return parts;
}

