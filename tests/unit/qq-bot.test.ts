// QQ 群机器人宿主：事件解析/触发判定/清洗/分条（纯逻辑测试；WS/HTTP 需真实 OneBot 服务）
import { describe, expect, it } from "vitest";
import { extractCqFile, extractUserText, isGroupMessage, splitForSend, stripCqCodes } from "../../hosts/qq-host/qq-bot";
import { writeEvidenceLog } from "../helpers/evidence";

describe("qq bot (onebot 11 parsing)", () => {
  it("isGroupMessage：只认群消息事件", () => {
    expect(isGroupMessage({ post_type: "message", message_type: "group" })).toBe(true);
    expect(isGroupMessage({ post_type: "message", message_type: "private" })).toBe(false);
    expect(isGroupMessage(null)).toBe(false);
  });

  it("被 @ 触发：去掉 at 段与 CQ 码，返回用户文本", () => {
    const ev = {
      post_type: "message",
      message_type: "group",
      group_id: 123,
      self_id: 100,
      raw_message: "[CQ:at,qq=100] 你好呀",
      message: [
        { type: "at", data: { qq: "100" } },
        { type: "text", data: { text: " 你好呀" } },
      ],
    };
    expect(extractUserText(ev, 100, "蕙")).toBe("你好呀");
  });

  it("触发词开头触发并去掉前缀；无关消息返回 null", () => {
    const ev = {
      post_type: "message",
      message_type: "group",
      group_id: 123,
      self_id: 100,
      raw_message: "蕙 你在吗",
    };
    expect(extractUserText(ev, 100, "蕙")).toBe("你在吗");
    expect(extractUserText({ ...ev, raw_message: "今天天气不错" }, 100, "蕙")).toBeNull();
  });

  it("stripCqCodes：清掉图片/表情等 CQ 码", () => {
    expect(stripCqCodes("看这个[CQ:image,file=abc]图 [CQ:face,id=1]")).toBe("看这个图");
  });

  it("splitForSend：超长回复按上限分条", () => {
    expect(splitForSend("短句", 500)).toEqual(["短句"]);
    const long = "字".repeat(1200);
    const parts = splitForSend(long, 500);
    expect(parts).toHaveLength(3);
    expect(parts.join("")).toBe(long);
  });

  it("extractCqFile：从 CQ 码提取语音/图片 file 路径", () => {
    expect(extractCqFile("[CQ:record,file=C:/napcat/cache/abc.amr,magic=1]", "record")).toBe(
      "C:/napcat/cache/abc.amr",
    );
    expect(extractCqFile("[CQ:image,file=img.png]", "record")).toBeNull();
    expect(extractCqFile("纯文本", "record")).toBeNull();
  });

  it("写入 qq-bot 证据产物", () => {
    writeEvidenceLog("qq-bot.test", ["group-event filter; @/trigger detection; cq strip; voice file extract; chunking"], true);
  });
});
