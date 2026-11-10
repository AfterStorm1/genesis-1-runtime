// Genesis-1 · QQ 群机器人宿主（值级；OneBot 11 协议，适配 NapCatQQ）
// 复用 createChatRuntime/sendUserMessage：每群一个运行时（记忆按群隔离、终止规则按群生效）。
// 群聊模式：关闭 TTS 与流式（纯文本回复）；@机器人 或以触发词开头才应答；每群冷却防刷。
// 语音消息：群里的 [CQ:record] 自动转写（云端/本地引擎）后按文本回复。
// 运行：qq-chat.cmd；环境变量见 hosts/qq-host 文档与 qq-chat.cmd 默认值。
import path from "node:path";
import type { ChatRuntime } from "../chat-host/chat-runtime";
import { createChatRuntime, sendUserMessage } from "../chat-host/chat-runtime";
import { createWhisperCppEngine } from "../../adapters/stt/whisper-engine";
import { fileSource } from "../../adapters/stt/voice-source";

/** 语音转写引擎（群语音消息用：cloud→bin→py 自动选择） */
const sttEngine = createWhisperCppEngine();

export interface QqBotConfig {
  /** OneBot 正向 WebSocket 地址（NapCat 配置），默认 ws://127.0.0.1:3001 */
  wsUrl: string;
  /** OneBot HTTP API 地址，默认 http://127.0.0.1:3000 */
  httpBase: string;
  /** 访问令牌（NapCat 网络配置里设置了令牌时必填；也可在 WebUI 里留空） */
  token?: string;
  /** 触发词（无 @ 时以此开头触发），默认“蕙” */
  trigger: string;
  /** 每群冷却（毫秒），默认 3000 */
  cooldownMs: number;
  /** 单条回复最大长度（超出分条发送），默认 500 */
  maxReplyLen: number;
}

export function readQqEnv(): QqBotConfig {
  const token = process.env.QQ_ONE_BOT_TOKEN;
  return {
    wsUrl: process.env.QQ_ONE_BOT_WS ?? "ws://127.0.0.1:3001",
    httpBase: (process.env.QQ_ONE_BOT_HTTP ?? "http://127.0.0.1:3000").replace(/\/+$/, ""),
    token: token !== undefined && token !== "" ? token : undefined,
    trigger: process.env.QQ_TRIGGER ?? "蕙",
    cooldownMs: Number(process.env.QQ_COOLDOWN_MS ?? 3000) || 3000,
    maxReplyLen: Number(process.env.QQ_MAX_REPLY_LEN ?? 500) || 500,
  };
}

interface OneBotGroupEvent {
  post_type?: string;
  message_type?: string;
  group_id?: number;
  user_id?: number;
  self_id?: number;
  raw_message?: string;
  message?: string | Array<{ type?: string; data?: { qq?: string | number; text?: string } }>;
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

/** 从 CQ 码提取指定类型的 file 路径（导出供测试）；如语音 [CQ:record,file=xxx] */
export function extractCqFile(raw: string, type: string): string | null {
  const m = raw.match(new RegExp(`\\[CQ:${type},file=([^,\\]]+)`));
  return m !== null && m[1] !== undefined ? m[1].trim() : null;
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
    // 字面 @（有些客户端 @ 只产生纯文本）也视为提及；否则必须是触发词开头
    body = body.replace(/^[@＠]\s*/, "");
    if (!body.startsWith(trigger)) return null;
    body = body.slice(trigger.length);
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

async function httpPost(
  httpBase: string,
  action: string,
  params: Record<string, unknown>,
  token?: string,
): Promise<void> {
  await fetch(`${httpBase}${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
}

/** 启动 QQ 群机器人（正向 WS 长连，自动重连；SIGINT 时释放全部运行时） */
export async function runQqBot(config: QqBotConfig): Promise<void> {
  const runtimes = new Map<string, Promise<ChatRuntime>>();
  const queues = new Map<string, Promise<void>>();
  const lastReplyAt = new Map<string, number>();
  const baseHistoryDir = process.env.CHAT_HISTORY_DIR ?? path.join(process.cwd(), "data", "chat-history");

  const runtimeFor = (groupId: string): Promise<ChatRuntime> => {
    let rt = runtimes.get(groupId);
    if (rt === undefined) {
      rt = createChatRuntime({
        tts: false, // 群聊不朗读
        stream: false, // 群聊纯文本
        historyDir: path.join(baseHistoryDir, `qq-${groupId}`), // 记忆按群隔离
      });
      runtimes.set(groupId, rt);
    }
    return rt;
  };

  const enqueue = (groupId: string, fn: () => Promise<void>): void => {
    const prev = queues.get(groupId) ?? Promise.resolve();
    const next = prev
      .then(fn)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[qq-bot] 群 ${groupId} 处理失败`, err);
      });
    queues.set(groupId, next);
  };

  const handle = (ev: OneBotGroupEvent): void => {
    if (!isGroupMessage(ev) || ev.group_id === undefined || ev.self_id === undefined) return;
    const groupId = String(ev.group_id);

    // 终止状态只提示一次（避免刷屏）
    const terminatedLogged = new Set<string>();
    const logTerminated = (gid: string): void => {
      if (!terminatedLogged.has(gid)) {
        terminatedLogged.add(gid);
        // eslint-disable-next-line no-console
        console.log(`[qq-bot] 群 ${gid} 已因红线终止互动，不再回应（重启 qq-chat.cmd 可重置）`);
      }
    };

    // 可见日志：每条群消息都显示是否到达（排查用；30 字截断）
    const rawPreview = stripCqCodes(ev.raw_message ?? "").slice(0, 30) || "（非文本/空）";
    // eslint-disable-next-line no-console
    console.log(`[qq-bot] 收到 群${groupId}: ${rawPreview}`);

    // —— 语音消息：群里发语音 → 转写 → 按文本回复（无需 @/触发词，避免漏听）——
    const recordFile = extractCqFile(ev.raw_message ?? "", "record");
    if (recordFile !== null && recordFile !== "") {
      enqueue(groupId, async () => {
        const now = Date.now();
        const last = lastReplyAt.get(groupId) ?? 0;
        if (now - last < config.cooldownMs) return;
        lastReplyAt.set(groupId, now);
        const chat = await runtimeFor(groupId);
        if (chat.guard.terminated) {
          logTerminated(groupId);
          return;
        }
        try {
          const heard = await sttEngine.transcribeFile(fileSource(recordFile, `qq-${groupId}`));
          if (heard.trim() === "") return;
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 语音转写：${heard}`);
          const { text: reply } = await sendUserMessage(chat, heard);
          if (reply === null || reply === "") return;
          for (const chunk of splitForSend(reply, config.maxReplyLen)) {
            await httpPost(config.httpBase, "/send_group_msg", {
              group_id: ev.group_id,
              message: chunk,
            }, config.token);
          }
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 已回复群 ${groupId}（语音）：${reply.slice(0, 40)}${reply.length > 40 ? "…" : ""}`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[qq-bot] 群 ${groupId} 语音转写失败：${err instanceof Error ? err.message : String(err)}`);
        }
      });
      return;
    }

    const text = extractUserText(ev, ev.self_id, config.trigger);
    if (text === null) {
      // 可见日志：文本消息未触发（不是 @ 也没触发词开头）
      if (!/\[CQ:(image|face|at)/.test(ev.raw_message ?? "")) {
        // eslint-disable-next-line no-console
        console.log(`[qq-bot] 未触发 群${groupId}：需要 @机器人 或以“${config.trigger}”开头`);
      }
      return;
    }
    enqueue(groupId, async () => {
      const now = Date.now();
      const last = lastReplyAt.get(groupId) ?? 0;
      if (now - last < config.cooldownMs) return; // 冷却
      lastReplyAt.set(groupId, now);
      const chat = await runtimeFor(groupId);
      if (chat.guard.terminated) {
        logTerminated(groupId);
        return; // 终止状态：该群不再回应
      }
      const { text: reply } = await sendUserMessage(chat, text);
      if (reply === null || reply === "") return;
      for (const chunk of splitForSend(reply, config.maxReplyLen)) {
        await httpPost(config.httpBase, "/send_group_msg", {
          group_id: ev.group_id,
          message: chunk,
        }, config.token);
      }
      // eslint-disable-next-line no-console
      console.log(`[qq-bot] 已回复群 ${groupId}：${reply.slice(0, 40)}${reply.length > 40 ? "…" : ""}`);
    });
  };

  let ws: WebSocket | undefined;
  let closed = false;
  const connect = (): void => {
    // 带访问令牌：NapCat WebSocket 鉴权用 access_token 查询参数
    const wsTarget =
      config.token !== undefined
        ? `${config.wsUrl}${config.wsUrl.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(config.token)}`
        : config.wsUrl;
    // eslint-disable-next-line no-console
    console.log(`[qq-bot] 连接 ${config.wsUrl}（触发：@ 或 “${config.trigger}”开头）`);
    ws = new WebSocket(wsTarget);
    ws.addEventListener("open", () => {
      // eslint-disable-next-line no-console
      console.log("[qq-bot] 已连接，等待群消息…");
    });
    ws.addEventListener("message", (evt) => {
      try {
        const data = JSON.parse(String(evt.data)) as OneBotGroupEvent;
        handle(data);
      } catch {
        /* 忽略非 JSON 帧 */
      }
    });
    ws.addEventListener("close", () => {
      if (closed) return;
      // eslint-disable-next-line no-console
      console.log("[qq-bot] 连接断开，5 秒后重连…");
      setTimeout(connect, 5_000);
    });
    ws.addEventListener("error", () => {
      /* close 会随后触发重连 */
    });
  };

  connect();

  const shutdown = async (): Promise<void> => {
    closed = true;
    ws?.close();
    const all = [...runtimes.values()];
    for (const p of all) {
      try {
        const rt = await p;
        await rt.rt.dispose();
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line no-console
    console.log("[qq-bot] 已退出。");
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === (await import("node:url")).pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runQqBot(readQqEnv()).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[qq-bot] 启动失败", err);
    process.exit(1);
  });
}
