// Genesis-1 · 表情包固定搭配匹配（值级）
// 视觉描述 → 关键词匹配本地固定搭配库；命中即视为「网络上有大量含义接近的回复」。
import fs from "node:fs";

export interface MemeImageEntry {
  /** 匹配关键词（描述文本命中任一即视为匹配） */
  keywords: string[];
  meaning: string;
  /** 常见回复（可选） */
  replies?: string;
}

export function parseMemeImages(raw: string): MemeImageEntry[] {
  const entries: MemeImageEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#") || t.startsWith(">")) continue;
    const parts = t.split("|").map((p) => p.trim());
    if (parts.length < 2) continue;
    const keywords = parts[0]!.split("/").map((k) => k.trim()).filter((k) => k !== "");
    if (keywords.length === 0) continue;
    entries.push({
      keywords,
      meaning: parts[1] ?? "",
      replies: parts[2] !== undefined && parts[2] !== "" ? parts[2] : undefined,
    });
  }
  return entries;
}

export function loadMemeImages(filePath: string): MemeImageEntry[] {
  try {
    return parseMemeImages(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

/** 描述文本命中任一关键词 → 返回条目；可命中多条 */
export function matchMemeImages(description: string, entries: MemeImageEntry[]): MemeImageEntry[] {
  const d = description.toLowerCase();
  return entries.filter((e) => e.keywords.some((k) => k !== "" && d.includes(k.toLowerCase())));
}

/** 命中条目转注入文本（导出供测试） */
export function memeMatchNote(hits: MemeImageEntry[]): string | null {
  if (hits.length === 0) return null;
  const h = hits[0]!;
  return `（这张图是网络上的固定搭配表情包：${h.meaning}${h.replies !== undefined ? `；常见回复是"${h.replies}"` : ""}）`;
}
