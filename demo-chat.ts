// Genesis-1 · 交互式聊天 demo（本地 Ollama / 在线 OpenAI 兼容 API 双模式）
// 直接运行：node node_modules\tsx\dist\cli.mjs demo-chat.ts  或 双击 chat.cmd
// 复用：createChatRuntime() 返回可编程的聊天运行时（供 Web UI / 其他宿主复用），
//       runChatLoop() 是终端交互循环。
// 环境变量：
//   GENESIS_PERSONA   人格卡路径（默认 config/persona/kaguya.persona.json）
//   —— 本地模式（未设置 LLM_API_KEY 时，默认）——
//   OLLAMA_MODEL      默认 qwen2.5:7b    OLLAMA_BASE_URL 默认 http://localhost:11434
//   —— 在线模式（设置 LLM_API_KEY 后自动切换）——
//   LLM_API_KEY       必填               LLM_BASE_URL 默认 https://api.deepseek.com
//   LLM_MODEL         默认 deepseek-chat
//   CHAT_MAX_TURNS    记忆保留轮数（默认 10）
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { compose } from "./composition/composition-root";
import type { RuntimeBundle } from "./core/runtime";
import { loadPersona } from "./layers/l1-persona/persona-loader";
import { createOpenAiCompatibleCognition } from "./adapters/llm/openai-compatible-cognition";
import { createInMemoryHistoryStore } from "./adapters/llm/in-memory-history-store";
import type { InMemoryHistoryStore } from "./adapters/llm/in-memory-history-store";
import { createMockSpeechRenderer } from "./adapters/renderers/mock-speech-renderer";
import { createTextRenderer } from "./adapters/renderers/text-renderer";
import type { PersonaCardV3 } from "./core/contract/persona";

export interface ChatRuntime {
  rt: RuntimeBundle;
  persona: PersonaCardV3;
  history: InMemoryHistoryStore;
  model: string;
  baseUrl: string;
  online: boolean;
  /** 持久化记忆文件（JSONL） */
  historyFile: string;
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
      : path.join(process.cwd(), "config", "persona", "kaguya.persona.json"));
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
  const rt = await compose({
    runtimeId: "rt:chat",
    personaId: "persona:chat",
    frameHz: 10,
    renderers: [createTextRenderer(), createMockSpeechRenderer()],
    parameters: [],
    cognition: createOpenAiCompatibleCognition({ persona, model, baseUrl, apiKey }),
    memory: history, // 对话记忆走契约预留的 MemoryStore → recall 路径
    batchTimeoutMs: 120_000, // 本地 LLM（CPU 推理）延迟远高于默认 2s 批次超时
  });

  return { rt, persona, history, model, baseUrl, online, historyFile };
}

/** 发送一条用户消息；返回角色回复（无台词返回 null）。同时维护对话记忆。 */
export function sendUserMessage(
  chat: ChatRuntime,
  text: string,
  timeoutMs = 120_000,
): Promise<{ text: string | null; emotion: string }> {
  const { rt, history } = chat;
  history.saveTurn("user", text);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (textReply: string | null, emotion: string): void => {
      if (settled) return;
      settled = true;
      if (textReply !== null) history.saveTurn("assistant", textReply);
      resolve({ text: textReply, emotion });
    };
    const unsub = rt.arbiter.onDispatch((s) => {
      const textReply = s.speech?.sanitizedText?.text ?? null;
      unsub();
      finish(textReply, s.emotion.emotion);
    });
    const timer = setTimeout(() => {
      unsub();
      finish(null, "neutral");
    }, timeoutMs);
    void timer;
    rt.inputBus.inject({ kind: "user_message", text });
  });
}

/** 终端交互循环（/quit 退出） */
export async function runChatLoop(chat: ChatRuntime): Promise<void> {
  const { persona, model, baseUrl, online, historyFile } = chat;
  // eslint-disable-next-line no-console
  console.log(`[llm] mode=${online ? "online" : "local-ollama"} model=${model} baseUrl=${baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[persona] loaded: ${persona.data.name}`);
  // eslint-disable-next-line no-console
  console.log(`[memory] ${chat.history.list().length} 条历史已载入，提示词取最近轮次；文件：${historyFile}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

  // eslint-disable-next-line no-console
  console.log(`\n与「${persona.data.name}」聊天开始（输入 /quit 退出；历史保留最近 ${chat.history.list().length === 0 ? "10" : "N"} 轮）\n`);

  for (;;) {
    const line = await ask("你 > ");
    if (line.trim() === "/quit" || line.trim() === "/exit") break;
    if (line.trim() === "") continue;
    const { text, emotion } = await sendUserMessage(chat, line);
    if (text === null) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} > （超时或本句只有情绪无台词）`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} (${emotion}) > ${text}`);
    }
  }

  rl.close();
  await chat.rt.dispose();
  // eslint-disable-next-line no-console
  console.log("已退出。");
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
