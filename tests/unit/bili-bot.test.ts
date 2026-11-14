// Bilibili 弹幕机器人：触发判定 / 弹幕解析 / csrf 提取（值级扩展测试）
import { describe, expect, it } from "vitest";
import { extractBiliJct, parseDanmakuList, shouldReplyDanmaku } from "../../hosts/bili-host/bili-bot";
import { writeEvidenceLog } from "../helpers/evidence";

describe("bili danmaku bot", () => {
  it("shouldReplyDanmaku：包含触发词才回复", () => {
    expect(shouldReplyDanmaku("bot 晚上好", "bot")).toBe(true);
    expect(shouldReplyDanmaku("主播好厉害", "bot")).toBe(false);
  });

  it("parseDanmakuList：解析 gethistory 响应，过滤空文本", () => {
    const raw = {
      data: {
        room: [
          { text: "bot 在吗", nickname: "小水", uid: 123, timeline: "2026-11-12 20:00:00" },
          { text: "", nickname: "空", uid: 0, timeline: "2026-11-12 20:00:01" },
          { text: "无时间戳", nickname: "某", uid: 9 },
        ],
      },
    };
    const list = parseDanmakuList(raw);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ text: "bot 在吗", nickname: "小水", uid: 123, timeline: "2026-11-12 20:00:00" });
  });

  it("extractBiliJct：从 cookie 提取 csrf 凭据", () => {
    expect(extractBiliJct("SESSDATA=abc; bili_jct=xyz123; DedeUserID=1")).toBe("xyz123");
    expect(extractBiliJct("SESSDATA=abc")).toBeUndefined();
  });

  it("写入 bili-bot 证据产物", () => {
    writeEvidenceLog("bili-bot.test", ["trigger; danmaku parse; csrf extract"], true);
  });
});
