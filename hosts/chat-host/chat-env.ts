// Genesis-1 · 聊天宿主：环境配置集中读取（所有 CHAT_*/LLM_*/OLLAMA_*/GENESIS_* 一处解析）
import path from "node:path";

export interface ChatEnvConfig {
  personaPath: string;
  worldRulesPath: string;
  samplesPath: string;
  historyDir: string;
  online: boolean;
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
  maxTurns: number;
  summaryEvery: number;
  memoryMax: number;
  memoryTtlDays: number;
  stream: boolean;
  charDelay: number;
  sentenceDelay: number;
  tts: boolean;
  ttsRate: number;
  emotion: boolean;
  sttLang: string;
  extraSystem: string | undefined;
  temperature: number | undefined;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrUndefined(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 从环境变量读取全部聊天配置（默认值集中在此，其余代码不再散读 process.env） */
export function readChatEnv(): ChatEnvConfig {
  const apiKey = process.env.LLM_API_KEY;
  const online = apiKey !== undefined && apiKey !== "";
  return {
    personaPath:
      process.env.GENESIS_PERSONA !== undefined
        ? path.resolve(process.env.GENESIS_PERSONA)
        : path.join(process.cwd(), "config", "persona", "hui.persona.json"),
    worldRulesPath:
      process.env.CHAT_WORLD_RULES !== undefined
        ? path.resolve(process.env.CHAT_WORLD_RULES)
        : path.join(process.cwd(), "config", "world", "hui-rules.md"),
    samplesPath:
      process.env.CHAT_REACTION_SAMPLES !== undefined
        ? path.resolve(process.env.CHAT_REACTION_SAMPLES)
        : path.join(process.cwd(), "config", "reactions", "samples.json"),
    historyDir: process.env.CHAT_HISTORY_DIR ?? path.join(process.cwd(), "data", "chat-history"),
    online,
    apiKey: online ? apiKey : undefined,
    model: online ? (process.env.LLM_MODEL ?? "deepseek-chat") : (process.env.OLLAMA_MODEL ?? "qwen3:8b"),
    baseUrl: online
      ? (process.env.LLM_BASE_URL ?? "https://api.deepseek.com")
      : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"),
    maxTurns: num(process.env.CHAT_MAX_TURNS, 10),
    summaryEvery: num(process.env.CHAT_SUMMARY_EVERY, 4),
    memoryMax: num(process.env.CHAT_MEMORY_MAX, 50),
    memoryTtlDays: num(process.env.CHAT_MEMORY_TTL_DAYS, 30),
    stream: (process.env.CHAT_STREAM ?? "1") !== "0",
    charDelay: num(process.env.CHAT_CHAR_DELAY, 25),
    sentenceDelay: num(process.env.CHAT_SENTENCE_DELAY, 300),
    tts: (process.env.CHAT_TTS ?? "1") !== "0",
    ttsRate: num(process.env.CHAT_TTS_RATE, 0),
    emotion: (process.env.CHAT_EMOTION ?? "1") !== "0",
    sttLang: process.env.CHAT_STT_LANG ?? "zh-CN",
    extraSystem: process.env.CHAT_EXTRA_SYSTEM?.trim() || undefined,
    temperature: numOrUndefined(process.env.CHAT_TEMPERATURE),
  };
}
