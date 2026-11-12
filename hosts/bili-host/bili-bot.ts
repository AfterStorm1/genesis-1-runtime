// Genesis-1 · Bilibili 直播间弹幕机器人（值级）
// v1：HTTP 轮询弹幕（gethistory 接口）→ 触发词（默认「蕙」）→ 本地运行时回复 → msg/send 发弹幕（需 BILI_COOKIE）。
// v2（路线图）：礼物/大航海事件（需 WS 协议）、主播声音转写（FLV 流抓取 + 持续 STT）。
import fs from "node:fs";
import path from "node:path";
import { createChatRuntime, sendUserMessage } from "../chat-host/chat-runtime";

export interface BiliDanmaku {
  text: string;
  nickname: string;
  uid: number;
  /** gethistory 返回的时间串，如 "2026-11-12 20:00:00" */
  timeline: string;
}

export interface BiliConfig {
  roomId: string;
  cookie?: string;
  trigger: string;
  pollMs: number;
  cooldownMs: number;
  historyDir: string;
  enabled: boolean;
}

export function readBiliEnv(): BiliConfig {
  const cookie = process.env.BILI_COOKIE;
  return {
    roomId: process.env.BILI_ROOM_ID ?? "",
    cookie: cookie !== undefined && cookie !== "" ? cookie : undefined,
    trigger: process.env.BILI_TRIGGER ?? "蕙",
    pollMs: Number(process.env.BILI_POLL_MS ?? 4000) || 4000,
    cooldownMs: Number(process.env.BILI_COOLDOWN_MS ?? 5000) || 5000,
    historyDir: process.env.CHAT_HISTORY_DIR ?? path.join(process.cwd(), "data", "chat-history"),
    enabled: (process.env.BILI_ENABLED ?? "1") !== "0",
  };
}

/** 弹幕是否触发回复（导出供测试）：包含触发词即触发 */
export function shouldReplyDanmaku(text: string, trigger: string): boolean {
  return text.includes(trigger);
}

/** 从 gethistory 响应解析弹幕列表（导出供测试） */
export function parseDanmakuList(raw: unknown): BiliDanmaku[] {
  const data = (raw as { data?: { room?: Array<{ text?: unknown; nickname?: unknown; uid?: unknown; timeline?: unknown }> } })
    ?.data;
  if (data?.room === undefined) return [];
  const out: BiliDanmaku[] = [];
  for (const r of data.room) {
    if (typeof r.text === "string" && r.text.trim() !== "") {
      out.push({
        text: r.text,
        nickname: typeof r.nickname === "string" ? r.nickname : "匿名",
        uid: typeof r.uid === "number" ? r.uid : 0,
        timeline: typeof r.timeline === "string" ? r.timeline : "",
      });
    }
  }
  return out;
}

/** 从 cookie 提取 bili_jct（发弹幕的 csrf 凭据） */
export function extractBiliJct(cookie: string): string | undefined {
  const m = cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
  return m?.[1];
}

/** 发送弹幕（需要登录 cookie）；失败返回 false（导出供测试的纯逻辑在调用处） */
export async function sendBiliDanmaku(roomId: string, cookie: string, text: string): Promise<boolean> {
  const csrf = extractBiliJct(cookie);
  if (csrf === undefined) return false;
  try {
    const res = await fetch("https://api.live.bilibili.com/msg/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie,
        Referer: `https://live.bilibili.com/${roomId}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body: new URLSearchParams({
        msg: text.slice(0, 100),
        roomid: roomId,
        mode: "1",
        csrf,
        csrf_token: csrf,
        rnd: String(Date.now()),
      }).toString(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { code?: number };
    return data.code === 0;
  } catch {
    return false;
  }
}

export async function runBiliBot(): Promise<void> {
  const config = readBiliEnv();
  if (!config.enabled || config.roomId === "") {
    // eslint-disable-next-line no-console
    console.error("[bili-bot] 未配置 BILI_ROOM_ID，退出。用法：set BILI_ROOM_ID=直播间号 后运行 bili-chat.cmd");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[bili-bot] 监听直播间 ${config.roomId}（触发词：“${config.trigger}”；${
      config.cookie !== undefined ? "已配置弹幕发送" : "未配置 BILI_COOKIE，回复只打印不发送"
    }）`,
  );

  const chat = await createChatRuntime({
    persona: undefined,
    historyDir: path.join(config.historyDir, `bili-${config.roomId}`),
    stream: false,
    tts: false,
  });
  let lastTimeline = "";
  let lastReplyAt = 0;

  for (;;) {
    try {
      const url = `https://api.live.bilibili.com/xlive/web-room/v1/dM/gethistory?roomid=${encodeURIComponent(config.roomId)}&room_type=0`;
      const res = await fetch(url, {
        headers: {
          Referer: `https://live.bilibili.com/${config.roomId}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          ...(config.cookie !== undefined ? { Cookie: config.cookie } : {}),
        },
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[bili-bot] 弹幕接口 http_${res.status}，稍后重试`);
      } else {
        const raw = (await res.json()) as unknown;
        const list = parseDanmakuList(raw).filter((d) => d.timeline > lastTimeline);
        for (const d of list) {
          lastTimeline = d.timeline;
          // eslint-disable-next-line no-console
          console.log(`[bili-bot] 弹幕 ${d.nickname}: ${d.text}`);
          if (!shouldReplyDanmaku(d.text, config.trigger)) continue;
          const now = Date.now();
          if (now - lastReplyAt < config.cooldownMs) continue;
          lastReplyAt = now;
          const { text: reply } = await sendUserMessage(chat, `（${d.nickname}说）${d.text}`);
          if (reply === null || reply === "") continue;
          const flat = reply.replace(/\s*\r?\n\s*/g, " ").trim();
          // eslint-disable-next-line no-console
          console.log(`[bili-bot] 回复 ${d.nickname}：${flat}`);
          if (config.cookie !== undefined) {
            const sent = await sendBiliDanmaku(config.roomId, config.cookie, flat);
            if (!sent) {
              // eslint-disable-next-line no-console
              console.warn("[bili-bot] 弹幕发送失败（cookie 可能过期）");
            }
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[bili-bot] 轮询异常：${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, config.pollMs));
  }
}

/** 直接运行入口（tsx hosts/bili-host/bili-bot.ts 或 bili-chat.cmd） */
if (process.argv[1]?.replace(/\\/g, "/").endsWith("hosts/bili-host/bili-bot.ts")) {
  void runBiliBot();
}
