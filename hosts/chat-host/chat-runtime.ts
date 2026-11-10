// Genesis-1 · 聊天宿主：运行时组装（createChatRuntime / sendUserMessage）
// 职责：读环境配置 → 组装三级记忆 + LLM 认知 + 渲染器 + 安全钩子 → compose → 可编程聊天运行时。
// 复用：Web UI / 其他宿主 import { createChatRuntime, sendUserMessage } 即可。
import fs from "node:fs";
import { compose } from "../../composition/composition-root";
import type { RuntimeBundle } from "../../core/runtime";
import { loadPersona } from "../../layers/l1-persona/persona-loader";
import type { PersonaCardV3 } from "../../core/contract/persona";
import { createOpenAiCompatibleCognition } from "../../adapters/llm/openai-compatible-cognition";
import { createSummarizer } from "../../adapters/llm/summarizer";
import type { Summarizer } from "../../adapters/llm/summarizer";
import { buildFewShotBlock, loadReactionSamples } from "../../adapters/llm/reaction-samples";
import { createTerminationHook } from "../../adapters/safety-guard/termination-hook";
import type { TerminationHook } from "../../adapters/safety-guard/termination-hook";
import { createEmotionStateMachine } from "../../adapters/drive/emotion-state-machine";
import type { EmotionStateMachine } from "../../adapters/drive/emotion-state-machine";
import { createEmotionBiasHook } from "../../adapters/drive/emotion-bias-hook";
import { createSapiSpeechRecognizer } from "../../adapters/stt/sapi-speech-recognizer";
import type { SpeechRecognizer } from "../../adapters/stt/sapi-speech-recognizer";
import { createMockSpeechRenderer } from "../../adapters/renderers/mock-speech-renderer";
import { createStreamingTextRenderer } from "../../adapters/renderers/streaming-text-renderer";
import type { StreamingTextRenderer } from "../../adapters/renderers/streaming-text-renderer";
import { createTtsSpeechRenderer } from "../../adapters/renderers/tts-speech-renderer";
import { createSapiSpeaker } from "../../adapters/tts/sapi-speaker";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import type { FeelingMemory, InMemoryHistoryStore, LongTermMemory } from "../../adapters/llm/memory";
import { readChatEnv } from "./chat-env";
import type { ChatEnvConfig } from "./chat-env";
import { assembleChatMemory } from "./memory-assembly";

export interface ChatRuntime {
  rt: RuntimeBundle;
  persona: PersonaCardV3;
  /** 短期轮次存储（逐字历史） */
  history: InMemoryHistoryStore;
  /** 长期记忆库（带遗忘机制） */
  longTerm: LongTermMemory;
  /** 第一人称感受库（感受会随时间变淡） */
  feelings: FeelingMemory;
  /** 摘要器（把轮次提炼成事实+感受） */
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
  /** 情绪状态机（轻量 InternalDrive；env.emotion=false 时不存在） */
  emotion?: EmotionStateMachine;
  /** 语音识别器（/说 命令触发；Windows SAPI，需要系统中文语音识别语言包） */
  recognizer: SpeechRecognizer;
  /** 环境配置快照 */
  env: ChatEnvConfig;
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
  const env = readChatEnv();
  const personaPath = opts?.personaPath ?? env.personaPath;
  const persona = loadPersona(personaPath);

  const apiKey = opts?.apiKey ?? env.apiKey;
  const online = apiKey !== undefined && apiKey !== "";
  const model = opts?.model ?? env.model;
  const baseUrl = opts?.baseUrl ?? env.baseUrl;
  const maxTurns = opts?.maxTurns ?? env.maxTurns;

  // 三级记忆（短/长/感受）一次装配
  const mem = assembleChatMemory(persona.data.name, env.historyDir, {
    maxTurns,
    memoryMax: env.memoryMax,
    memoryTtlDays: env.memoryTtlDays,
  });
  const summarizer = createSummarizer({ baseUrl, model, apiKey });

  // 世界观/规则 + 反应样本 few-shot 合并进 system 提示词
  let worldRules: string | undefined;
  if (fs.existsSync(env.worldRulesPath)) {
    worldRules = fs.readFileSync(env.worldRulesPath, "utf8");
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[config] CHAT_WORLD_RULES 指向的文件不存在，已忽略：${env.worldRulesPath}`);
  }
  let samplesBlock: string | undefined;
  if (fs.existsSync(env.samplesPath)) {
    const { samples, warnings } = loadReactionSamples(env.samplesPath);
    for (const w of warnings) {
      // eslint-disable-next-line no-console
      console.warn(`[config] ${w}`);
    }
    samplesBlock = buildFewShotBlock(samples) || undefined;
  }
  const extraSystemPrompt =
    [
      env.extraSystem,
      worldRules?.trim() ? `[世界观/规则]\n${worldRules.trim()}` : undefined,
      samplesBlock,
    ]
      .filter((x): x is string => x !== undefined)
      .join("\n\n") || undefined;

  // 安全钩子（最高优先级终止规则）+ 情绪注记钩子
  const guard = createTerminationHook();
  const emotion = env.emotion ? createEmotionStateMachine() : undefined;

  // 渲染器：流式文本（默认）+ TTS 语音（默认 SAPI）
  const textRenderer = env.stream
    ? createStreamingTextRenderer({ charDelayMs: env.charDelay, sentenceDelayMs: env.sentenceDelay })
    : createTextRenderer();
  const speechRenderer = env.tts
    ? createTtsSpeechRenderer({ speaker: createSapiSpeaker({ rate: env.ttsRate }) })
    : createMockSpeechRenderer();

  // 语音识别器（/说 触发）
  const recognizer = createSapiSpeechRecognizer({ culture: env.sttLang });

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
      temperature: env.temperature,
      quiet: env.stream, // 流式模式下静音 llm.request 日志，避免串行干扰打字机输出
    }),
    memory: mem.memory, // 对话记忆走契约预留的 MemoryStore → recall 路径
    hooks: [
      guard,
      ...(emotion !== undefined ? [createEmotionBiasHook(emotion, { label: persona.data.name })] : []),
    ],
    batchTimeoutMs: 120_000, // 本地 LLM（CPU 推理）延迟远高于默认 2s 批次超时
  });

  const whenRendered = env.stream
    ? (): Promise<void> => (textRenderer as StreamingTextRenderer).whenIdle()
    : undefined;

  return {
    rt,
    persona,
    history: mem.history,
    longTerm: mem.longTerm,
    feelings: mem.feelings,
    summarizer,
    guard,
    model,
    baseUrl,
    online,
    historyFile: mem.historyFile,
    longTermFile: mem.longTermFile,
    streamOutput: env.stream,
    whenRendered,
    emotion,
    recognizer,
    env,
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
