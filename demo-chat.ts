// Genesis-1 · 交互式聊天 demo（本地 Ollama / 在线 OpenAI 兼容 API 双模式）
// 直接运行：node node_modules\tsx\dist\cli.mjs demo-chat.ts  或 双击 chat.cmd
// 复用：createChatRuntime() 返回可编程的聊天运行时（供 Web UI / 其他宿主复用），
//       runChatLoop() 是终端交互循环。
// 环境变量：
//   GENESIS_PERSONA   人格卡路径（默认 config/persona/hui.persona.json，主角「蕙」）
//   —— 本地模式（未设置 LLM_API_KEY 时，默认）——
//   OLLAMA_MODEL      默认 qwen3:8b     OLLAMA_BASE_URL 默认 http://localhost:11434
//   —— 在线模式（设置 LLM_API_KEY 后自动切换）——
//   LLM_API_KEY       必填               LLM_BASE_URL 默认 https://api.deepseek.com
//   LLM_MODEL         默认 deepseek-chat
//   CHAT_MAX_TURNS    短期提示词轮数（默认 10）
//   CHAT_SUMMARY_EVERY 每 N 个用户回合提炼一次长期记忆（默认 4；0 关闭）
//   CHAT_MEMORY_MAX    长期记忆容量（默认 50）  CHAT_MEMORY_TTL_DAYS 遗忘天数（默认 30）
//   CHAT_HISTORY_DIR   记忆文件目录（默认 data/chat-history）
//   CHAT_WORLD_RULES   世界观/任务/对话偏向规则文件（默认 config/world/hui-rules.md）
//   CHAT_EXTRA_SYSTEM  直接追加一行/一段 system 规则（与 CHAT_WORLD_RULES 合并）
//   CHAT_TEMPERATURE   采样温度（默认 0.7；低=稳重，高=跳脱）
//   CHAT_STREAM        流式输出开关（默认 1 开启；0 回退整段打印）
//   CHAT_CHAR_DELAY    流式逐字延迟 ms（默认 25）  CHAT_SENTENCE_DELAY 句间延迟 ms（默认 300）
//   CHAT_TTS           语音输出开关（默认 1：Windows SAPI 离线朗读；0 关闭）
//   CHAT_TTS_RATE      SAPI 语速 -10（慢）~10（快），默认 0
//   CHAT_EMOTION       情绪状态机开关（默认 1；0 关闭；每 60s tick，波动超阈值她会主动说话）
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { compose } from "./composition/composition-root";
import type { RuntimeBundle } from "./core/runtime";
import { loadPersona } from "./layers/l1-persona/persona-loader";
import { createOpenAiCompatibleCognition } from "./adapters/llm/openai-compatible-cognition";
import { createInMemoryHistoryStore } from "./adapters/llm/in-memory-history-store";
import type { InMemoryHistoryStore } from "./adapters/llm/in-memory-history-store";
import { createLongTermMemory } from "./adapters/llm/long-term-memory";
import type { LongTermMemory } from "./adapters/llm/long-term-memory";
import { createChatMemory } from "./adapters/llm/chat-memory";
import { createSummarizer } from "./adapters/llm/summarizer";
import type { Summarizer } from "./adapters/llm/summarizer";
import { createTerminationHook } from "./adapters/safety-guard/termination-hook";
import type { TerminationHook } from "./adapters/safety-guard/termination-hook";
import { createEmotionStateMachine } from "./adapters/drive/emotion-state-machine";
import type { EmotionStateMachine } from "./adapters/drive/emotion-state-machine";
import { createEmotionBiasHook } from "./adapters/drive/emotion-bias-hook";
import { createMockSpeechRenderer } from "./adapters/renderers/mock-speech-renderer";
import { createStreamingTextRenderer } from "./adapters/renderers/streaming-text-renderer";
import type { StreamingTextRenderer } from "./adapters/renderers/streaming-text-renderer";
import { createTtsSpeechRenderer } from "./adapters/renderers/tts-speech-renderer";
import { createSapiSpeaker } from "./adapters/tts/sapi-speaker";
import { createTextRenderer } from "./adapters/renderers/text-renderer";
import type { PersonaCardV3 } from "./core/contract/persona";
import { COGNITION_CONTRACT_VERSION } from "./core/contract/cognition";

export interface ChatRuntime {
  rt: RuntimeBundle;
  persona: PersonaCardV3;
  /** 短期轮次存储（逐字历史） */
  history: InMemoryHistoryStore;
  /** 长期记忆库（带遗忘机制） */
  longTerm: LongTermMemory;
  /** 摘要器（把轮次提炼成长记忆） */
  summarizer: Summarizer;
  /** 终止互动钩子（最高优先级安全规则） */
  guard: TerminationHook;
  model: string;
  baseUrl: string;
  online: boolean;
  /** 持久化文件（JSONL） */
  historyFile: string;
  longTermFile: string;
  /** 是否流式输出（true 时回复由渲染器逐句打印，主循环不重复打印） */
  streamOutput: boolean;
  /** 流式模式下等待渲染器播完（否则下一个输入提示会与打字机输出串行） */
  whenRendered?: () => Promise<void>;
  /** 情绪状态机（轻量 InternalDrive；CHAT_EMOTION=0 时不存在） */
  emotion?: EmotionStateMachine;
}

export interface ChatRuntimeOptions {
  personaPath?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  maxTurns?: number;
}

/** 组装聊天运行时（LLM 模式自动判定：有 apiKey → 在线，否则本地 Ollama） */
export async function createChatRuntime(opts?: ChatRuntimeOptions): Promise<ChatRuntime> {
  const personaPath =
    opts?.personaPath ??
    (process.env.GENESIS_PERSONA !== undefined
      ? path.resolve(process.env.GENESIS_PERSONA)
      : path.join(process.cwd(), "config", "persona", "hui.persona.json")); // 默认人格：蕙
  const persona = loadPersona(personaPath);

  const apiKey = opts?.apiKey ?? process.env.LLM_API_KEY;
  const online = apiKey !== undefined && apiKey !== "";
  const model =
    opts?.model ?? (online ? (process.env.LLM_MODEL ?? "deepseek-chat") : (process.env.OLLAMA_MODEL ?? "qwen3:8b"));
  const baseUrl =
    opts?.baseUrl ??
    (online ? (process.env.LLM_BASE_URL ?? "https://api.deepseek.com") : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"));
  const envTurns = Number(process.env.CHAT_MAX_TURNS);
  const maxTurns = opts?.maxTurns ?? (Number.isFinite(envTurns) && envTurns > 0 ? envTurns : 10);
  // 持久化记忆：每个角色一个 JSONL 文件，重启后自动续上（可用 CHAT_HISTORY_DIR 覆盖目录）
  const historyDir = process.env.CHAT_HISTORY_DIR ?? path.join(process.cwd(), "data", "chat-history");
  const historyFile = path.join(historyDir, `${persona.data.name}.jsonl`);

  const history = createInMemoryHistoryStore({ maxTurns, filePath: historyFile });
  // 长期记忆库：容量 50、TTL 30 天、淘汰只归档不删除（带遗忘机制）
  const longTermFile = path.join(historyDir, `${persona.data.name}.longterm.jsonl`);
  const longTerm = createLongTermMemory({
    filePath: longTermFile,
    maxEntries: Number(process.env.CHAT_MEMORY_MAX ?? 50) || 50,
    ttlDays: Number(process.env.CHAT_MEMORY_TTL_DAYS ?? 30),
  });
  // 组合记忆：pipeline 的 recall 一次返回「长期记忆条目 + 最近轮次」
  const memory = createChatMemory({ turns: history, longTerm });
  const summarizer = createSummarizer({ baseUrl, model, apiKey });

  // 世界观/规则注入：CHAT_WORLD_RULES（文件）+ CHAT_EXTRA_SYSTEM（文本）合并进 system 提示词；
  // 未显式设置时默认加载主角「蕙」的规则文件。
  const worldRulesFile =
    process.env.CHAT_WORLD_RULES !== undefined
      ? path.resolve(process.env.CHAT_WORLD_RULES)
      : path.join(process.cwd(), "config", "world", "hui-rules.md");
  let worldRules: string | undefined;
  if (worldRulesFile !== undefined) {
    if (fs.existsSync(worldRulesFile)) {
      worldRules = fs.readFileSync(worldRulesFile, "utf8");
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[config] CHAT_WORLD_RULES 指向的文件不存在，已忽略：${worldRulesFile}`);
    }
  }
  const extraSystemPrompt =
    [
      process.env.CHAT_EXTRA_SYSTEM?.trim() || undefined,
      worldRules?.trim() ? `[世界观/规则]\n${worldRules.trim()}` : undefined,
    ]
      .filter((x): x is string => x !== undefined)
      .join("\n\n") || undefined;
  const temperature = Number(process.env.CHAT_TEMPERATURE);

  // 最高优先级安全钩子：越界输入 → 永久终止互动
  const guard = createTerminationHook();

  // 流式输出（默认开启）：StreamingTextRenderer 逐句打字机式打印；
  // CHAT_STREAM=0 回退普通 TextRenderer（主循环整段打印）。
  const streamOutput = (process.env.CHAT_STREAM ?? "1") !== "0";
  const charDelay = Number(process.env.CHAT_CHAR_DELAY);
  const sentenceDelay = Number(process.env.CHAT_SENTENCE_DELAY);
  const textRenderer = streamOutput
    ? createStreamingTextRenderer({
        charDelayMs: Number.isFinite(charDelay) ? charDelay : 25,
        sentenceDelayMs: Number.isFinite(sentenceDelay) ? sentenceDelay : 300,
      })
    : createTextRenderer();

  // 语音输出（默认开启）：Windows SAPI 离线朗读；CHAT_TTS=0 回退静音 Mock（保持 feedback 回路）
  const ttsOn = (process.env.CHAT_TTS ?? "1") !== "0";
  const ttsRate = Number(process.env.CHAT_TTS_RATE);
  const speechRenderer = ttsOn
    ? createTtsSpeechRenderer({ speaker: createSapiSpeaker({ rate: Number.isFinite(ttsRate) ? ttsRate : 0 }) })
    : createMockSpeechRenderer();

  // 情绪状态机（轻量 InternalDrive，默认开启；CHAT_EMOTION=0 关闭）
  const emotionOn = (process.env.CHAT_EMOTION ?? "1") !== "0";
  const emotion = emotionOn ? createEmotionStateMachine() : undefined;

  const rt = await compose({
    runtimeId: "rt:chat",
    personaId: "persona:chat",
    frameHz: 10,
    renderers: [textRenderer, speechRenderer],
    parameters: [],
    cognition: createOpenAiCompatibleCognition({
      persona,
      model,
      baseUrl,
      apiKey,
      extraSystemPrompt,
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      quiet: streamOutput, // 流式模式下静音 llm.request 日志，避免串行干扰打字机输出
    }),
    memory, // 对话记忆走契约预留的 MemoryStore → recall 路径
    hooks: [
      guard, // 终止互动钩子（beforeCognition 强制判定，最高优先级）
      ...(emotion !== undefined
        ? [createEmotionBiasHook(emotion, { label: persona.data.name })] // 情绪注记注入
        : []),
    ],
    batchTimeoutMs: 120_000, // 本地 LLM（CPU 推理）延迟远高于默认 2s 批次超时
  });

  // 流式模式下：主循环等待渲染器播完再显示下一个输入提示
  const whenRendered = streamOutput
    ? (): Promise<void> => (textRenderer as StreamingTextRenderer).whenIdle()
    : undefined;

  return {
    rt,
    persona,
    history,
    longTerm,
    summarizer,
    guard,
    model,
    baseUrl,
    online,
    historyFile,
    longTermFile,
    streamOutput,
    whenRendered,
    emotion,
  };
}

/** 发送一条用户消息；返回角色回复（无台词返回 null）。同时维护对话记忆。
 *  终止状态下（guard.terminated）不注入、不保存历史，只返回“连接中断...”。 */
export function sendUserMessage(
  chat: ChatRuntime,
  text: string,
  timeoutMs = 120_000,
): Promise<{ text: string | null; emotion: string }> {
  const { rt, history, guard } = chat;
  if (guard.terminated) {
    return Promise.resolve({ text: "连接中断...", emotion: "neutral" });
  }
  history.saveTurn("user", text);
  return new Promise((resolve) => {
    let settled = false;
    const unsub = rt.arbiter.onDispatch((s) => {
      finish(s.speech?.sanitizedText?.text ?? null, s.emotion.emotion);
    });
    const timer = setTimeout(() => finish(null, "neutral"), timeoutMs);
    // 本轮触发终止钩子时不会产生回复：轮询感知，立即返回“连接中断...”
    const poll = setInterval(() => {
      if (guard.terminated) finish("连接中断...", "neutral");
    }, 200);
    const finish = (textReply: string | null, emotion: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      unsub();
      if (textReply !== null && textReply !== "连接中断...") history.saveTurn("assistant", textReply);
      resolve({ text: textReply, emotion });
    };
    rt.inputBus.inject({ kind: "user_message", text });
  });
}

/** 终端交互循环（/quit 退出；/忘记 关键词 遗忘；/记忆 查看长期记忆） */
export async function runChatLoop(chat: ChatRuntime): Promise<void> {
  const { persona, model, baseUrl, online, historyFile, longTerm } = chat;
  const summaryEvery = Number(process.env.CHAT_SUMMARY_EVERY ?? 4) || 0; // 每 N 个用户回合提炼一次；0 关闭
  // eslint-disable-next-line no-console
  console.log(`[llm] mode=${online ? "online" : "local-ollama"} model=${model} baseUrl=${baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[persona] loaded: ${persona.data.name}`);
  const activeLong = longTerm.list().filter((e) => e.archived !== true).length;
  // eslint-disable-next-line no-console
  console.log(
    `[memory] 短期历史 ${chat.history.list().length} 条 + 长期记忆 ${activeLong} 条；文件：${historyFile}`,
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

  // eslint-disable-next-line no-console
  console.log(
    `\n与「${persona.data.name}」聊天开始（/quit 退出 / 记忆 查看 / 忘记 关键词 遗忘 / 情绪 查看）\n`,
  );

  if (chat.emotion !== undefined) {
    const s = chat.emotion.state();
    // eslint-disable-next-line no-console
    console.log(`[情绪] 初始 ${s.emotion}，强度 ${s.intensity.toFixed(2)}（夸奖/批评/安抚都会影响；情绪高了她会主动说话）`);
  }

  let userTurns = 0;
  // 情绪驱动循环：每 60 秒 tick 一次；波动超阈值时她会自主开口（离线自主生活最小实现）
  const driveTimer = setInterval(() => {
    void (async () => {
      if (chat.emotion === undefined || chat.guard.terminated) return;
      const intent = await chat.emotion.tick();
      if (intent !== null) {
        // eslint-disable-next-line no-console
        console.log("\n[自主] 情绪波动，蕙想说话……");
        await chat.rt.pipeline.handleInput({
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "drive_intent",
          intent,
          persona: chat.persona,
        });
        await chat.whenRendered?.();
      }
    })();
  }, 60_000);

  for (;;) {
    const line = await ask("你 > ");
    const trimmed = line.trim();
    if (trimmed === "/quit" || trimmed === "/exit") break;
    if (trimmed === "") continue;

    // —— 终止状态：不再回应任何输入（/quit 仍有效）——
    if (chat.guard.terminated) {
      // eslint-disable-next-line no-console
      console.log("连接中断...");
      continue;
    }

    // —— 显式遗忘命令（遗忘机制入口 3）——
    if (trimmed.startsWith("/忘记 ")) {
      const n = longTerm.forget(trimmed.slice("/忘记 ".length));
      // eslint-disable-next-line no-console
      console.log(`已遗忘 ${n} 条相关记忆（归档可回滚：longTerm.restoreArchived()）`);
      continue;
    }
    if (trimmed === "/记忆") {
      const items = longTerm.list().filter((e) => e.archived !== true);
      if (items.length === 0) {
        // eslint-disable-next-line no-console
        console.log("（还没有长期记忆。多聊几轮，我会自动提炼。）");
      } else {
        for (const e of items) {
          // eslint-disable-next-line no-console
          console.log(`  · [重要度${e.importance}] ${e.text}`);
        }
      }
      continue;
    }
    if (trimmed === "/情绪") {
      if (chat.emotion === undefined) {
        // eslint-disable-next-line no-console
        console.log("（情绪状态机未启用：CHAT_EMOTION=0）");
      } else {
        const s = chat.emotion.state();
        // eslint-disable-next-line no-console
        console.log(
          `[情绪] ${s.emotion} | 强度 ${s.intensity.toFixed(2)} | VAD v=${s.valence.toFixed(2)} a=${s.arousal.toFixed(2)} d=${s.dominance.toFixed(2)}`,
        );
      }
      continue;
    }

    // —— 情绪事件：分析输入并施加（夸奖/批评/安抚/亲近/压力）——
    if (chat.emotion !== undefined) {
      const before = chat.emotion.state().emotion;
      chat.emotion.applyText(trimmed);
      const after = chat.emotion.state();
      if (after.emotion !== before) {
        // eslint-disable-next-line no-console
        console.log(`[情绪] ${before} → ${after.emotion}（强度 ${after.intensity.toFixed(2)}）`);
      }
    }

    // 流式模式：先打印名字前缀，回复由渲染器逐句打字机输出
    if (chat.streamOutput) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} >`);
    }
    const { text, emotion } = await sendUserMessage(chat, trimmed);
    if (text === null) {
      // eslint-disable-next-line no-console
      console.log(chat.streamOutput ? "（超时或本句只有情绪无台词）" : `${persona.data.name} > （超时或本句只有情绪无台词）`);
    } else if (text === "连接中断...") {
      // 本轮触发终止：渲染器没有收到回复，由主循环输出
      // eslint-disable-next-line no-console
      console.log("连接中断...");
    } else if (!chat.streamOutput) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} (${emotion}) > ${text}`);
    }

    // 流式模式：等打字机播完再显示下一个输入提示，避免回复串进“你 >”输入行
    await chat.whenRendered?.();

    // —— 长期记忆提炼（每 summaryEvery 个用户回合一次）——
    userTurns += 1;
    if (summaryEvery > 0 && userTurns % summaryEvery === 0) {
      // eslint-disable-next-line no-console
      console.log("（正在提炼长期记忆…本地模型这一步会慢一点）");
      const recent = chat.history
        .list()
        .slice(-12)
        .map((i) => `${i.role === "user" ? "用户" : persona.data.name}：${i.content}`)
        .join("\n");
      try {
        const items = await chat.summarizer.summarize(recent);
        for (const t of items) longTerm.add(t);
        const nowActive = longTerm.list().filter((e) => e.archived !== true).length;
        // eslint-disable-next-line no-console
        console.log(`[memory] 新增 ${items.length} 条长期记忆（现存 ${nowActive} 条）`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[memory] 提炼失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  rl.close();
  clearInterval(driveTimer);
  await chat.rt.dispose();
  // eslint-disable-next-line no-console
  console.log("已退出。长期记忆与历史已保存。");
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  createChatRuntime()
    .then((chat) => runChatLoop(chat))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
