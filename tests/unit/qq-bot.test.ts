// QQ 群机器人宿主：事件解析/触发判定/清洗/分条（纯逻辑测试；WS/HTTP 需真实 OneBot 服务）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  downloadRecord,
  extractCqFile,
  extractCqImageUrl,
  extractCqRecord,
  extractCqReply,
  extractUserText,
  isGroupMessage,
  parseOwnerCommand,
  resolveRecordFile,
  resolveRecordWithRetry,
  shouldGreetFriend,
  splitForSend,
  stripCqCodes,
} from "../../hosts/qq-host/qq-bot";
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

  it("消息中间出现触发词也触发（不要求第一个字）", () => {
    const ev = {
      post_type: "message",
      message_type: "group",
      group_id: 123,
      self_id: 100,
      raw_message: "你们知道蕙去哪了吗",
    };
    expect(extractUserText(ev, 100, "蕙")).toBe("你们知道去哪了吗");
    expect(extractUserText({ ...ev, raw_message: "没有那个字" }, 100, "蕙")).toBeNull();
  });

  it("字面 @（纯文本，无 CQ at 段）也视为提及", () => {
    const ev = {
      post_type: "message",
      message_type: "group",
      group_id: 123,
      self_id: 100,
      raw_message: "@蕙 理我一下",
    };
    expect(extractUserText(ev, 100, "蕙")).toBe("理我一下");
    expect(extractUserText({ ...ev, raw_message: "@ 蕙 在吗" }, 100, "蕙")).toBe("在吗");
    expect(extractUserText({ ...ev, raw_message: "@别人 在吗" }, 100, "蕙")).toBeNull(); // 不是 @ 她
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

  it("extractCqRecord：优先 message 数组段（含 path/url），兜底 raw CQ 码", () => {
    const segEv = {
      post_type: "message",
      message_type: "group",
      raw_message: "[CQ:record,file=a.amr]",
      message: [{ type: "record", data: { file: "a.amr", path: "D:/nap/cache/a.amr", url: "http://x/a.amr" } }],
    };
    expect(extractCqRecord(segEv)).toEqual({ file: "a.amr", path: "D:/nap/cache/a.amr", url: "http://x/a.amr" });
    const rawEv = {
      post_type: "message",
      message_type: "group",
      raw_message: "[CQ:record,file=b.amr,path=D:/x/b.amr]",
      message: "text",
    };
    expect(extractCqRecord(rawEv)).toEqual({ file: "b.amr", path: "D:/x/b.amr", url: undefined });
    expect(extractCqRecord({ ...rawEv, raw_message: "纯文本" })).toBeNull();
  });

  it("resolveRecordFile：path 优先；file 相对名在根目录内定位；找不到返回 null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-rec-"));
    fs.mkdirSync(path.join(dir, "deep"));
    fs.writeFileSync(path.join(dir, "deep", "v.amr"), "x");
    expect(resolveRecordFile({ path: path.join(dir, "deep", "v.amr") }, [dir])).toBe(
      path.join(dir, "deep", "v.amr"),
    );
    expect(resolveRecordFile({ file: "v.amr" }, [dir])).toBe(path.join(dir, "deep", "v.amr"));
    expect(resolveRecordFile({ file: "nope.amr" }, [dir])).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("resolveRecordWithRetry：文件稍后落盘时轮询等到它出现", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-retry-"));
    const target = path.join(dir, "late.amr");
    setTimeout(() => fs.writeFileSync(target, "x"), 600);
    const hit = await resolveRecordWithRetry({ path: target }, [dir], 3_000, 100);
    expect(hit).toBe(target);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("downloadRecord：fetch url 写入本地（stub fetch）", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch;
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-dl-"));
      const out = path.join(dir, "v.amr");
      expect(await downloadRecord("https://x/v.amr", out)).toBe(out);
      expect(fs.readFileSync(out)).toEqual(Buffer.from([1, 2, 3]));
      fs.rmSync(dir, { recursive: true, force: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("parseOwnerCommand：主人指令解析；普通文本/其他指令返回 null", () => {
    expect(parseOwnerCommand("!reset")).toBe("reset");
    expect(parseOwnerCommand("!clear")).toBe("clear");
    expect(parseOwnerCommand("!status")).toBe("status");
    expect(parseOwnerCommand("!ban")).toBeNull();
    expect(parseOwnerCommand("今晚吃什么")).toBeNull();
  });

  it("shouldGreetFriend：好友当天首次出现才打招呼", () => {
    expect(shouldGreetFriend(undefined, "2026/11/11")).toBe(true);
    expect(shouldGreetFriend("2026/11/10", "2026/11/11")).toBe(true);
    expect(shouldGreetFriend("2026/11/11", "2026/11/11")).toBe(false);
  });

  it("extractCqReply / extractCqImageUrl：引用 id 与图片 url 提取", () => {
    expect(extractCqReply("[CQ:reply,id=12345] 哈哈")).toBe("12345");
    expect(extractCqReply("纯文本")).toBeNull();
    expect(extractCqImageUrl("[CQ:image,file=xx.png,url=https://cdn.qq.com/a.png]")).toBe(
      "https://cdn.qq.com/a.png",
    );
    expect(extractCqImageUrl("[CQ:image,file=xx.png]")).toBeNull();
  });

  it("写入 qq-bot 证据产物", () => {
    writeEvidenceLog("qq-bot.test", ["group-event filter; @/trigger detection; cq strip; voice record extract/resolve/retry/download; owner commands; daily friend greet; quote/image extract; chunking"], true);
  });
});
