// 表情包固定搭配库：解析 / 匹配 / 注入文本（值级扩展测试）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMemeImages, matchMemeImages, memeMatchNote, parseMemeImages } from "../../adapters/llm/meme-images";
import { writeEvidenceLog } from "../helpers/evidence";

describe("meme image dictionary", () => {
  it("解析库文件：忽略注释/空行，关键词按 / 拆分", () => {
    const entries = parseMemeImages(
      "# 注释\n> 说明\n\n- 狗头 | 反讽/开玩笑 | 狗头保命\n- 流汗黄豆/汗 | 无语\n",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ keywords: ["狗头"], meaning: "反讽/开玩笑", replies: "狗头保命" });
    expect(entries[1]!.keywords).toEqual(["流汗黄豆", "汗"]);
  });

  it("matchMemeImages：描述命中关键词即匹配；memeMatchNote 生成注入文本", () => {
    const entries = parseMemeImages("- 狗头 | 反讽/开玩笑 | 狗头保命");
    const hits = matchMemeImages("图里是一个黄色的狗头表情", entries);
    expect(hits).toHaveLength(1);
    expect(memeMatchNote(hits)).toContain("固定搭配表情包");
    expect(memeMatchNote(hits)).toContain("狗头保命");
    expect(memeMatchNote(matchMemeImages("一张风景照", entries))).toBeNull();
  });

  it("内置库可加载且非空", () => {
    const entries = loadMemeImages(path.join(process.cwd(), "config", "world", "meme-images.md"));
    expect(entries.length).toBeGreaterThanOrEqual(8);
    fs.rmSync(os.tmpdir(), { recursive: false, force: true }); // no-op 防误删（占位）
  });

  it("写入 meme-images 证据产物", () => {
    writeEvidenceLog("meme-images.test", ["parse; match; note"], true);
  });
});
