// Genesis-1 · QQ 群机器人宿主（值级；OneBot 11 协议，适配 NapCatQQ）
// 复用 createChatRuntime/sendUserMessage：每群一个运行时（记忆按群隔离、终止规则按群生效）。
// 群聊模式：关闭 TTS 与流式（纯文本回复）；@机器人 或以触发词开头才应答；每群冷却防刷。
// 语音消息：群里的 [CQ:record] 自动转写（云端/本地引擎）后按文本回复。
// 运行：qq-chat.cmd；环境变量见 hosts/qq-host 文档与 qq-chat.cmd 默认值。
import fs from "node:fs";
import path from "node:path";
import type { ChatRuntime } from "../chat-host/chat-runtime";
import { createChatRuntime, sendUserMessage } from "../chat-host/chat-runtime";
import { createWhisperCppEngine, runtimeTmpDir } from "../../adapters/stt/whisper-engine";
import { fileSource } from "../../adapters/stt/voice-source";
import { createImageDescriber } from "../../adapters/llm/image-vision";
import { createTtsEngine } from "../../adapters/tts/edge-tts";

/** 语音转写引擎（群语音消息用：cloud→bin→py 自动选择） */
const sttEngine = createWhisperCppEngine();
/** 图片识别（视觉模型，key 复用 SiliconFlow） */
const imageDescriber = createImageDescriber();
/** TTS 引擎（Edge 免费首选 → SiliconFlow 云端兜底；音色经 TTS_EDGE_VOICE / TTS_CLOUD_VOICE 自定义） */
const tts = createTtsEngine();

/** 冒犯词（观察区域判定；严重越界另有终止钩子） */
export const OFFENSE_WORDS: readonly string[] = [
  "傻逼",
  "煞笔",
  "脑残",
  "白痴",
  "弱智",
  "废物",
  "去死",
  "贱人",
  "sb",
  "nmsl",
  "智障",
];

/** 是否冒犯言论（导出供测试） */
export function classifyOffense(text: string): boolean {
  const t = text.toLowerCase();
  return OFFENSE_WORDS.some((w) => t.includes(w.toLowerCase()));
}

export interface QqBotConfig {
  /** OneBot 正向 WebSocket 地址（NapCat 配置），默认 ws://127.0.0.1:3001 */
  wsUrl: string;
  /** OneBot HTTP API 地址，默认 http://127.0.0.1:3000 */
  httpBase: string;
  /** 访问令牌（NapCat 网络配置里设置了令牌时必填；也可在 WebUI 里留空） */
  token?: string;
  /** boss QQ 号集合（QQ_OWNER_IDS 逗号分隔；仅boss可发 ! 管理指令，消息带管理员注记） */
  ownerIds: Set<string>;
  /** 好朋友 QQ 号集合（QQ_FRIEND_IDS 逗号分隔；消息带好朋友注记，无管理权限） */
  friendIds: Set<string>;
  /** 好朋友昵称映射（QQ_FRIEND_NAMES，格式 qq:名字,qq:名字） */
  friendNames: Map<string, string>;
  /** 触发词（无 @ 时以此开头触发），默认“蕙” */
  trigger: string;
  /** 每群冷却（毫秒），默认 3000 */
  cooldownMs: number;
  /** 触发后等图窗口（毫秒）：触发聊天后的下一张图才识别，默认 60_000 */
  imageWindowMs: number;
  /** 颜文字发射配置（心情好时句尾跟一个，宿主控制节奏） */
  kaomoji: KaomojiConfig;
  /** 语音回复配置（对老板/喜欢的人用语音回复） */
  qqVoiceReply: { enabled: boolean; cooldownMs: number };
  /** 单条回复最大长度（超出分条发送），默认 500 */
  maxReplyLen: number;
}

function csvSet(v: string | undefined): Set<string> {
  return new Set(
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
  );
}

function nameMap(v: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of (v ?? "").split(",")) {
    const [qq, name] = part.split(":");
    if (qq !== undefined && name !== undefined && qq.trim() !== "" && name.trim() !== "") {
      m.set(qq.trim(), name.trim());
    }
  }
  return m;
}

export function readQqEnv(): QqBotConfig {
  const token = process.env.QQ_ONE_BOT_TOKEN;
  return {
    wsUrl: process.env.QQ_ONE_BOT_WS ?? "ws://127.0.0.1:3001",
    httpBase: (process.env.QQ_ONE_BOT_HTTP ?? "http://127.0.0.1:3000").replace(/\/+$/, ""),
    token: token !== undefined && token !== "" ? token : undefined,
    ownerIds: csvSet(process.env.QQ_OWNER_IDS),
    friendIds: csvSet(process.env.QQ_FRIEND_IDS),
    friendNames: nameMap(process.env.QQ_FRIEND_NAMES),
    trigger: process.env.QQ_TRIGGER ?? "蕙",
    cooldownMs: Number(process.env.QQ_COOLDOWN_MS ?? 3000) || 3000,
    imageWindowMs: Number(process.env.QQ_IMAGE_WINDOW_MS ?? 60_000) || 60_000,
    kaomoji: {
      enabled: (process.env.QQ_KAOMOJI ?? "1") !== "0",
      minIntensity: Number(process.env.QQ_KAOMOJI_MIN ?? 0.55) || 0.55,
      cooldownMs: Number(process.env.QQ_KAOMOJI_COOLDOWN_MS ?? 300_000) || 300_000,
    },
    qqVoiceReply: {
      enabled: (process.env.QQ_VOICE_REPLY ?? "0") === "1",
      cooldownMs: Number(process.env.QQ_VOICE_COOLDOWN_MS ?? 60_000) || 60_000,
    },
    maxReplyLen: Number(process.env.QQ_MAX_REPLY_LEN ?? 500) || 500,
  };
}

import {
  downloadRecord,
  extractCqImageUrl,
  extractCqRecord,
  extractCqReply,
  extractUserText,
  isGroupMessage,
  parseOwnerCommand,
  resolveRecordWithRetry,
  shouldGreetFriend,
  splitForSend,
  stripCqCodes,
} from "./qq-messages";
import type { OneBotGroupEvent, OwnerCommand } from "./qq-messages";
import { pickKaomoji } from "./kaomoji";
import type { KaomojiConfig } from "./kaomoji";
// 向后兼容：原导出路径（tests 等引用方不动）
export * from "./qq-messages";
async function httpPost(
  httpBase: string,
  action: string,
  params: Record<string, unknown>,
  token?: string,
): Promise<void> {
  await httpApi(httpBase, action, params, token);
}

/** OneBot HTTP API 调用并返回 JSON（get_msg 等需要返回值） */
async function httpApi(
  httpBase: string,
  action: string,
  params: Record<string, unknown>,
  token?: string,
): Promise<{ data?: Record<string, unknown> }> {
  const res = await fetch(`${httpBase}${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`onebot_http_${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as { data?: Record<string, unknown> };
}

/** 管理指令执行（导出供测试）：reset/clear = 重建本群运行时 + 清记忆；status = 回报状态 */
export async function handleOwnerCommand(
  cmd: OwnerCommand,
  groupId: string,
  ctx: {
    config: QqBotConfig;
    runtimes: Map<string, Promise<ChatRuntime>>;
    lastReplyAt: Map<string, number>;
    baseHistoryDir: string;
    offenses: Map<string, Map<string, number>>;
    blacklists: Map<string, Set<string>>;
    turnCounts: Map<string, number>;
  },
): Promise<void> {
  if (cmd === "reset" || cmd === "clear") {
    const old = ctx.runtimes.get(groupId);
    if (old !== undefined) {
      try {
        await (await old).rt.dispose();
      } catch {
        /* 忽略 */
      }
      ctx.runtimes.delete(groupId);
    }
    ctx.lastReplyAt.delete(groupId);
    ctx.offenses.delete(groupId);
    ctx.blacklists.delete(groupId);
    ctx.turnCounts.delete(groupId);
    fs.rmSync(path.join(ctx.baseHistoryDir, `qq-${groupId}`), { recursive: true, force: true });
    await httpPost(
      ctx.config.httpBase,
      "/send_group_msg",
      { group_id: Number(groupId), message: "已重置本群：记忆与终止状态已清空。" },
      ctx.config.token,
    );
    // eslint-disable-next-line no-console
    console.log(`[qq-bot] boss已重置群 ${groupId}`);
    return;
  }
  if (cmd === "status") {
    let detail: string;
    const pending = ctx.runtimes.get(groupId);
    if (pending === undefined) {
      detail = "本群尚未产生过对话。";
    } else {
      const chat = await pending;
      const facts = chat.longTerm.list().filter((e) => e.archived !== true).length;
      const feels = chat.feelings.list().filter((e) => e.archived !== true).length;
      const turns = chat.history.list().length;
      const term = chat.guard.terminated ? "已终止(红线)" : "正常";
      const emo = chat.emotion !== undefined
        ? `${chat.emotion.state().emotion}/${chat.emotion.state().intensity.toFixed(2)}`
        : "关";
      detail = `状态 ${term} | 短期 ${turns} 条 | 事实 ${facts} | 感受 ${feels} | 情绪 ${emo}`;
    }
    await httpPost(
      ctx.config.httpBase,
      "/send_group_msg",
      { group_id: Number(groupId), message: detail },
      ctx.config.token,
    );
  }
}

/** 启动 QQ 群机器人（正向 WS 长连，自动重连；SIGINT 时释放全部运行时） */
export async function runQqBot(config: QqBotConfig): Promise<void> {
  const runtimes = new Map<string, Promise<ChatRuntime>>();
  const queues = new Map<string, Promise<void>>();
  const lastReplyAt = new Map<string, number>();
  /** 好友每日首次问候记录：key = "群号:QQ号" → 日期串 */
  const friendGreetings = new Map<string, string>();
  /** 触发聊天后的等图窗口：群号 → 截止时间戳（之后的下一张图才识别） */
  const awaitingImage = new Map<string, number>();
  /** 颜文字冷却：群号 → 上次发射时间 */
  const kaomojiLast = new Map<string, number>();
  /** 冒犯计数：群号 → (QQ号 → 次数) */
  const offenses = new Map<string, Map<string, number>>();
  /** 黑名单：群号 → QQ号集合（三次冒犯后不再互动） */
  const blacklists = new Map<string, Set<string>>();
  /** 每群用户回合计数（长期记忆提炼节拍） */
  const turnCounts = new Map<string, number>();

  /** 心情好时按冷却在句尾跟一个颜文字（宿主控制节奏，不滥用） */
  const withKaomoji = (groupId: string, chat: ChatRuntime, textReply: string): string => {
    const k = pickKaomoji(chat.emotion?.state(), kaomojiLast.get(groupId) ?? 0, Date.now(), config.kaomoji);
    if (k === null) return textReply;
    kaomojiLast.set(groupId, Date.now());
    return `${textReply} ${k}`;
  };

  /** 给语音引擎补句读：台词无标点会让 TTS 失去降调（语音助手腔），合成前逐句补“。” */
  const forTts = (spoken: string): string =>
    spoken
      .split(/[。！？!?…]+|\s+/)
      .filter((s) => s !== "")
      .map((s) => {
        const last = s.slice(-1);
        return last === "？" || last === "?" || last === "！" || last === "!" || last === "…" ? s : `${s}。`;
      })
      .join("");

  /** 回复发送：对老板/喜欢的人可用语音（TTS，短句），失败/不满足时落回文字 */
  const voiceLast = new Map<string, number>();
  /** 语音前剥掉命令样内容与动作描述（set/rem 行、TTS_ 字样、（动作）括号），防止念出来 */
  const spokenSafe = (text: string): string =>
    text
      .split(/\n/)
      .filter((l) => !/^\s*(set|rem)\s/i.test(l))
      .join(" ")
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/TTS_[A-Z_]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const sendReply = async (groupId: string, groupNumber: number | undefined, chat: ChatRuntime, flat: string, isTrusted: boolean): Promise<void> => {
    const wantVoice =
      config.qqVoiceReply.enabled && isTrusted && flat.length <= 120 && (Date.now() - (voiceLast.get(groupId) ?? 0) >= config.qqVoiceReply.cooldownMs);
    if (wantVoice) {
      const spoken = spokenSafe(flat);
      if (spoken === "") {
        // 剥完只剩动作描述：不发语音（动作本来就不该念），落回文字
        const finalText = withKaomoji(groupId, chat, flat);
        for (const chunk of splitForSend(finalText, config.maxReplyLen)) {
          await httpPost(config.httpBase, "/send_group_msg", {
            group_id: groupNumber,
            message: chunk,
          }, config.token);
        }
        return;
      }
      const out = path.join(runtimeTmpDir(), `qq-voice-${Date.now()}.mp3`);
      // 语音跟着她的心情走：情绪状态 → 语气/语速（Edge 用语速模拟，云端用语气指令）
      const made = await tts.synthesizeToFile(
        forTts(spoken),
        out,
        chat.emotion !== undefined ? { emotion: chat.emotion.state().emotion } : undefined,
      );
      if (made !== null) {
        voiceLast.set(groupId, Date.now());
        await httpPost(
          config.httpBase,
          "/send_group_msg",
          { group_id: groupNumber, message: `[CQ:record,file=file:///${made.replace(/\\/g, "/")}]` },
          config.token,
        );
        // eslint-disable-next-line no-console
        console.log(`[qq-bot] 已语音回复群 ${groupId}：${flat.slice(0, 30)}`);
        return;
      }
      // eslint-disable-next-line no-console
      console.warn("[qq-bot] 语音合成失败，落回文字回复");
    }
    const final = withKaomoji(groupId, chat, flat); // 文字路径才加颜文字（语音读出来怪）
    for (const chunk of splitForSend(final, config.maxReplyLen)) {
      await httpPost(config.httpBase, "/send_group_msg", {
        group_id: groupNumber,
        message: chunk,
      }, config.token);
    }
  };
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

  const handle = async (ev: OneBotGroupEvent): Promise<void> => {
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

    const senderId = String(ev.user_id ?? "");
    const isOwner = config.ownerIds.has(senderId);
    const isFriend = config.friendIds.has(senderId);

    // —— 语音消息：老板/喜欢的人随时可触发；普通群友需在「触发聊天后的窗口」内 ——
    const rec = extractCqRecord(ev);
    if (rec !== null) {
      if (!isOwner && !isFriend) {
        const due = awaitingImage.get(groupId) ?? 0;
        if (Date.now() > due) {
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 忽略语音：需要先 @机器人 或提“${config.trigger}”再发语音`);
          return;
        }
        awaitingImage.delete(groupId); // 一次性：窗口内的下一段语音
      }
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
          const roots = [
            process.env.QQ_NAP_CAT_DIR ?? "D:\\ruanjian\\NapCat.Shell.Windows.Node",
            process.cwd(),
          ];
          // 1) 轮询等文件落盘（事件可能早于下载完成） 2) 兜底：从事件 url 下载
          let local = await resolveRecordWithRetry(rec, roots);
          if (local === null && rec.url !== undefined && rec.url !== "") {
            const dl = path.join(runtimeTmpDir(), `${Date.now()}.amr`);
            try {
              local = await downloadRecord(rec.url, dl);
            } catch (dlErr) {
              // eslint-disable-next-line no-console
              console.error(`[qq-bot] url 下载失败：${dlErr instanceof Error ? dlErr.message : String(dlErr)}`);
            }
          }
          if (local === null) {
            // eslint-disable-next-line no-console
            console.error(`[qq-bot] 语音文件定位失败，事件字段：${JSON.stringify(rec)}`);
            return;
          }
          const heard = await sttEngine.transcribeFile(fileSource(local, `qq-${groupId}`));
          if (heard.trim() === "") return;
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 语音转写：${heard}`);
          const { text: reply } = await sendUserMessage(chat, heard);
          if (reply === null || reply === "") return;
          const flat = reply.replace(/\s*\r?\n\s*/g, " ").trim(); // 群聊单行
          await sendReply(groupId, ev.group_id, chat, flat, isOwner || isFriend);
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 已回复群 ${groupId}（语音）：${reply.slice(0, 40)}${reply.length > 40 ? "…" : ""}`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[qq-bot] 群 ${groupId} 语音转写失败：${err instanceof Error ? err.message : String(err)}`);
        }
      });
      return;
    }

    // —— 冒犯分级（观察区域 → 三次拉黑；不适用于老板/喜欢的人）——
    let offenseCount = 0;
    if (!isOwner && !isFriend) {
      const bl = blacklists.get(groupId);
      if (bl?.has(senderId)) {
        // eslint-disable-next-line no-console
        console.log(`[qq-bot] 群 ${groupId} 已拉黑 ${senderId}，忽略其消息`);
        return;
      }
      const rawText = stripCqCodes(ev.raw_message ?? "");
      if (classifyOffense(rawText)) {
        let g = offenses.get(groupId);
        if (g === undefined) {
          g = new Map<string, number>();
          offenses.set(groupId, g);
        }
        offenseCount = (g.get(senderId) ?? 0) + 1;
        g.set(senderId, offenseCount);
        // eslint-disable-next-line no-console
        console.log(`[qq-bot] 群 ${groupId} ${senderId} 冒犯第 ${offenseCount} 次，进入观察区域`);
        if (offenseCount >= 3) {
          let b = blacklists.get(groupId);
          if (b === undefined) {
            b = new Set<string>();
            blacklists.set(groupId, b);
          }
          b.add(senderId);
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 已将 ${senderId} 拉黑，不再互动`);
          return;
        }
      }
    }

    // —— 引用触发：有人引用她说的话 → 自动回复（无需 @/触发词）——
    let quotedMe = false;
    const replyId = extractCqReply(ev.raw_message ?? "");
    if (replyId !== null) {
      try {
        const msg = await httpApi(config.httpBase, "/get_msg", { message_id: Number(replyId) }, config.token);
        const sender = (msg.data as { sender?: { user_id?: number | string } } | undefined)?.sender;
        quotedMe = sender !== undefined && String(sender.user_id) === String(ev.self_id);
      } catch {
        quotedMe = false; // 查不到引用目标则不按引用触发
      }
    }

    // 图片 URL/本地路径：优先消息数组段，兜底 raw CQ 码；QQ 的 url 可能是百分号编码
    const rawImgUrl = extractCqImageUrl(ev.raw_message ?? "");
    let imgUrl = rawImgUrl;
    let imgLocal: string | undefined;
    let imgFile: string | undefined;
    if (Array.isArray(ev.message)) {
      for (const m of ev.message) {
        if (m.type !== "image") continue;
        if (imgUrl === null && typeof m.data?.url === "string") imgUrl = m.data.url;
        if (imgFile === undefined && typeof m.data?.file === "string") imgFile = m.data.file;
        if (imgLocal === undefined && typeof m.data?.path === "string" && m.data.path !== "") {
          imgLocal = m.data.path; // NapCat 本地缓存（优先，绕过 CDN 400）
        } else if (imgLocal === undefined && typeof m.data?.file === "string" && path.isAbsolute(m.data.file)) {
          imgLocal = m.data.file;
        }
      }
    }
    if (imgUrl !== null && /^https?%3A/i.test(imgUrl)) {
      try {
        imgUrl = decodeURIComponent(imgUrl);
      } catch {
        /* 保持原样 */
      }
    }
    if (imgUrl !== null && imgLocal === undefined && Array.isArray(ev.message)) {
      const seg = ev.message.find((m) => m.type === "image");
      // 排查用：看看 NapCat 给图片事件带了哪些字段
      // eslint-disable-next-line no-console
      console.log(`[qq-bot] 图片事件无本地路径，字段：${JSON.stringify(seg?.data ?? {})}`.slice(0, 400));
    }

    let text = quotedMe
      ? stripCqCodes(ev.raw_message ?? "").trim()
      : extractUserText(ev, ev.self_id, config.trigger);
    // 触发但没文字：图片需在「触发聊天之后的等图窗口」内才识别（只认下一张）
    if (text === "" || text === null) {
      if (imgUrl !== null) {
        const due = awaitingImage.get(groupId) ?? 0;
        if (Date.now() > due) {
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 忽略图片：没有前置的触发聊天`);
          return;
        }
        awaitingImage.delete(groupId); // 一次性：只认下一张图
        text = "";
      } else {
        if (!quotedMe && !/\[CQ:(image|face|at)/.test(ev.raw_message ?? "")) {
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 未触发 群${groupId}：需要 @机器人 或以“${config.trigger}”开头`);
        }
        return;
      }
    }

    // —— 管理指令（仅管理员；群员发 ! 开头直接忽略）——
    if (isOwner) {
      const cmd = parseOwnerCommand(text);
      if (cmd !== null) {
        enqueue(groupId, async () => {
          await handleOwnerCommand(cmd, groupId, { config, runtimes, lastReplyAt, baseHistoryDir, offenses, blacklists, turnCounts });
        });
        return;
      }
    } else if (text.trim().startsWith("!")) {
      // eslint-disable-next-line no-console
      console.log(`[qq-bot] 群 ${groupId} 非boss成员尝试指令，忽略`);
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
        return; // 终止状态：该群不再回应（boss可用 !reset 重置）
      }
      // 图片识别：消息里带了图 → 视觉模型描述后附进上下文；
      // 纯文字触发 → 开启等图窗口（窗口内的下一张图才识别）
      let effectiveText = text;
      if (imgUrl !== null || imgLocal !== undefined || imgFile !== undefined) {
        // 本地路径缺失时走 NapCat 官方 get_image 接口拿绝对路径（QQ 表情/图片缓存目录）
        if (imgLocal === undefined && imgFile !== undefined) {
          try {
            const gi = await httpApi(config.httpBase, "/get_image", { file: imgFile }, config.token);
            const f = (gi.data as { file?: string } | undefined)?.file;
            if (typeof f === "string" && f !== "") imgLocal = f;
          } catch {
            /* 保持 undefined，退回 url 下载 */
          }
        }
        const desc = await imageDescriber.describeImage({ url: imgUrl ?? undefined, localPath: imgLocal });
        if (desc !== null) {
          // eslint-disable-next-line no-console
          console.log(`[qq-bot] 群 ${groupId} 图片识别：${desc.slice(0, 40)}`);
          effectiveText = `${effectiveText}\n（对方还发了一张图：${desc}）`;
        } else if (effectiveText.trim() === "") {
          // 图没识别出来且没有文字：静默，不给她制造“没收到”的反馈
          return;
        }
      } else {
        awaitingImage.set(groupId, Date.now() + config.imageWindowMs);
      }
      // 身份由宿主判定注入，用轻量自然标记（系统注记腔会传染机器味）：
      // 老板/喜欢的人带说话人括号，普通群友不加任何标记，引用单独轻提示
      const friendName = config.friendNames.get(senderId);
      let friendGreet = false;
      if (isFriend) {
        // 喜欢的人今天第一次出现 → 主动友好打招呼（按她的方式说，不是模板）
        const today = new Date().toLocaleDateString("zh-CN");
        const key = `${groupId}:${senderId}`;
        if (shouldGreetFriend(friendGreetings.get(key), today)) {
          friendGreetings.set(key, today);
          friendGreet = true;
        }
      }
      const observeNote = offenseCount > 0 ? `（这个人在观察区域，已冒犯 ${offenseCount} 次）` : "";
      const speaker = isOwner
        ? "老板"
        : isFriend
          ? `${friendName ?? "你喜欢的人"}${friendGreet ? "（今天第一次出现，主动友好打个招呼）" : ""}`
          : null;
      const quoteNote = quotedMe && !isOwner && !isFriend ? "（有人引用了你说过的话）" : "";
      const inputText =
        speaker !== null
          ? `（${speaker}说）${effectiveText}`
          : `${observeNote}${quoteNote}${effectiveText}`;
      const { text: reply } = await sendUserMessage(chat, inputText);
      if (reply === null || reply === "") return;
      // —— 长期记忆提炼（每 N 个用户回合一次，与终端宿主一致；0 关闭）——
      const summaryEvery = Number(process.env.QQ_SUMMARY_EVERY ?? 8) || 8;
      if (summaryEvery > 0) {
        const n = (turnCounts.get(groupId) ?? 0) + 1;
        turnCounts.set(groupId, n);
        if (n % summaryEvery === 0) {
          try {
            const recent = chat.history
              .list()
              .slice(-12)
              .map((i) => `${i.role === "user" ? "用户" : "蕙"}：${i.content}`)
              .join("\n");
            const { facts, feelings } = await chat.summarizer.summarize(recent);
            for (const t of facts) chat.longTerm.add(t);
            for (const f of feelings) chat.feelings.add(f.text, f.emotion);
            // eslint-disable-next-line no-console
            console.log(`[qq-bot] 群 ${groupId} 已提炼长期记忆：+${facts.length} 事实 +${feelings.length} 感受`);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[qq-bot] 群 ${groupId} 长期记忆提炼失败：${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      const flat = reply.replace(/\s*\r?\n\s*/g, " ").trim(); // 群聊单行
      await sendReply(groupId, ev.group_id, chat, flat, isOwner || isFriend);
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
        void handle(data);
      } catch {
        /* 忽略非 JSON 帧 */
      }
    });
    ws.addEventListener("close", (ev) => {
      if (closed) return;
      // eslint-disable-next-line no-console
      console.log(`[qq-bot] 连接断开（code=${ev.code} reason=${ev.reason || "无"}），5 秒后重连…`);
      setTimeout(connect, 5_000);
    });
    ws.addEventListener("error", (ev) => {
      // eslint-disable-next-line no-console
      console.warn(`[qq-bot] WS 错误：${ev.message ?? String(ev)}`);
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
