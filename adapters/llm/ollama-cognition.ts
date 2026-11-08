// Genesis-1 · OpenAI 兼容 LLM 认知适配器（值级扩展：只加 adapters/，不动 core/contract/）
// 同一协议同时支持：
//   - 本地 Ollama：baseUrl=http://localhost:11434，无需 apiKey
//   - 在线 API（DeepSeek / OpenAI / 通义等）：baseUrl+model+apiKey
// 功能：把人格卡 + 用户输入交给 LLM，把回复解析成骨架认识的
// CognitionOutput（emotion + speech），走既有校验/聚合/仲裁/渲染全链路。
import type { Clock } from "../../core/contract/clock";
import type { Cognition, CognitionContext, CognitionInput, CognitionOutput } from "../../core/contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import type { Logger } from "../../core/contract/pipeline-hook";
import type { PersonaCardV3 } from "../../core/contract/persona";

export interface OpenAiCompatibleCognitionOptions {
  /** 默认 http://localhost:11434（本地 Ollama）；在线服务填其 API 地址，如 https://api.deepseek.com */
  baseUrl?: string;
  /** 默认 qwen2.5:7b（本地）；在线服务填其模型名，如 deepseek-chat */
  model?: string;
  /** 在线服务必填；本地 Ollama 不填 */
  apiKey?: string;
  persona: PersonaCardV3;
  /** 默认 0.8 */
  temperature?: number;
  /** 默认 512 */
  maxTokens?: number;
}

export interface OpenAiCompatibleCognition extends Cognition {
  /** Q5 桥接取用点：composition 本地 duck-typed 只读访问 persona */
  readonly persona: PersonaCardV3;
}

/** 向后兼容别名：本地 Ollama 用法 */
export type OllamaCognitionOptions = OpenAiCompatibleCognitionOptions;
export type OllamaCognition = OpenAiCompatibleCognition;

interface LlmReply {
  emotion?: string;
  intensity?: number;
  speech?: string;
}

/** 解析 LLM 返回：JSON（兼容旧格式）→ 标记行格式 → 兜底整段当台词 */
function parseReply(raw: string): LlmReply {
  const text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence?.[1] ?? text).trim();
  // 1) JSON（旧格式兼容）
  try {
    const obj = JSON.parse(body) as unknown;
    if (typeof obj === "object" && obj !== null) {
      const o = obj as LlmReply;
      if (typeof o.speech === "string" || typeof o.emotion === "string") return o;
    }
  } catch {
    /* 非 JSON，走标记行格式 */
  }
  // 2) 标记行格式（小模型遵守率高）：[EMOTION] / [INTENSITY] / [SPEECH]
  const emotion = body.match(/\[EMOTION\]\s*([^\r\n]+)/i)?.[1]?.trim();
  const intensityRaw = body.match(/\[INTENSITY\]\s*([^\r\n]+)/i)?.[1]?.trim();
  const speech = body.match(/\[SPEECH\]\s*([\s\S]*)$/i)?.[1]?.trim();
  if (emotion !== undefined || speech !== undefined) {
    return { emotion, intensity: Number(intensityRaw), speech: speech === "" ? undefined : speech };
  }
  // 3) 兜底：整段当台词，情绪 neutral
  return { speech: body };
}

export function createOpenAiCompatibleCognition(
  opts: OpenAiCompatibleCognitionOptions,
): OpenAiCompatibleCognition {
  const baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
  const model = opts.model ?? "qwen2.5:7b";
  const apiKey = opts.apiKey;
  const temperature = opts.temperature ?? 0.8;
  const maxTokens = opts.maxTokens ?? 512;
  let logger: Logger | undefined;

  function buildMessages(input: CognitionInput): Array<{ role: string; content: string }> {
    const p = input.persona;
    const system = [
      `你是「${p.data.name}」。`,
      p.data.description ? `设定：${p.data.description}` : "",
      p.data.personality ? `性格：${p.data.personality}` : "",
      p.data.scenario ? `场景：${p.data.scenario}` : "",
      p.data.first_mes ? `示例开场白：${p.data.first_mes}` : "",
      `回复要求：严格按下面三行格式输出，不要输出任何其他内容：`,
      `[EMOTION] happy`,
      `[INTENSITY] 0.6`,
      `[SPEECH] 你的台词`,
      `EMOTION 从 happy/sad/angry/neutral/surprised/calm 中选；INTENSITY 是 0~1 的数字；SPEECH 必须存在，用中文、贴合角色口吻、不超过 80 字。`,
    ]
      .filter(Boolean)
      .join("\n");
    const messages: Array<{ role: string; content: string }> = [{ role: "system", content: system }];
    if (input.kind === "user_message") {
      messages.push({ role: "user", content: input.text });
    } else if (input.kind === "perception") {
      messages.push({ role: "user", content: `[感知] 世界快照：${JSON.stringify(input.snapshot)}` });
    } else if (input.kind === "drive_intent") {
      messages.push({ role: "user", content: `[自主意图] ${input.intent.kind}` });
    } else if (input.kind === "feedback") {
      messages.push({ role: "user", content: `[反馈] ${input.feedback.kind}` });
    }
    return messages;
  }

  return {
    id: "cognition:llm",
    persona: opts.persona,
    async mount(ctx: CognitionContext): Promise<void> {
      logger = ctx.logger;
      void ctx.clock;
    },
    async *onInput(input: CognitionInput): AsyncGenerator<CognitionOutput> {
      const messages = buildMessages(input);
      logger?.info("llm.request", { model, baseUrl });
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey !== undefined ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      });
      if (!res.ok) {
        logger?.error("llm.error", { status: res.status });
        // 降级台词：保证会话不静默（骨架行为）
        yield {
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "speech",
          speech: { text: `（LLM 调用失败：HTTP ${res.status}）`, interruptible: true },
        };
        return;
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const reply = parseReply(raw);
      const emotion = reply.emotion ?? "neutral";
      const rawIntensity = Number(reply.intensity);
      const intensity = Number.isNaN(rawIntensity)
        ? 0.5
        : Math.min(1, Math.max(0, rawIntensity));
      if (reply.speech !== undefined && reply.speech !== "") {
        yield {
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "emotion",
          intent: { emotion, intensity, contextTags: ["llm"] },
          vad: { valence: intensity, arousal: intensity * 0.8, dominance: 0.3 },
        };
        yield {
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "speech",
          speech: { text: reply.speech, interruptible: true },
        };
      } else {
        yield {
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "emotion",
          intent: { emotion, intensity, contextTags: ["llm"] },
        };
      }
    },
    dispose(): void {
      // 无自有资源
    },
  };
}

/** 向后兼容别名：本地 Ollama 用法 */
export const createOllamaCognition = createOpenAiCompatibleCognition;
