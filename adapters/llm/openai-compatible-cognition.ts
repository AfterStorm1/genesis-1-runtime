// Genesis-1 · OpenAI 兼容 LLM 认知适配器（值级扩展：只加 adapters/，不动 core/contract/）
// 同一协议同时支持：
//   - 本地 Ollama：baseUrl=http://localhost:11434，无需 apiKey
//   - 在线 API（DeepSeek / OpenAI / 通义等）：baseUrl + model + apiKey
// 功能：人格卡（system）+ 记忆（input.recall → 历史轮次）+ 当前输入 → LLM，
// 把回复解析成骨架认识的 CognitionOutput（emotion + speech），
// 走既有校验/聚合/仲裁/渲染全链路。
import type { Clock } from "../../core/contract/clock";
import type { Cognition, CognitionContext, CognitionInput, CognitionOutput } from "../../core/contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import type { Logger } from "../../core/contract/pipeline-hook";
import type { PersonaCardV3 } from "../../core/contract/persona";

export interface OpenAiCompatibleCognitionOptions {
  /** 默认 http://localhost:11434（本地 Ollama）；在线服务填其 API 地址，如 https://api.deepseek.com */
  baseUrl?: string;
  /** 默认 qwen3:8b（本地）；在线服务填其模型名，如 deepseek-chat */
  model?: string;
  /** 在线服务必填；本地 Ollama 不填 */
  apiKey?: string;
  persona: PersonaCardV3;
  /** 默认 0.7（小模型偏低更稳，避免答非所问） */
  temperature?: number;
  /** 默认 512 */
  maxTokens?: number;
  /** 追加到 system 提示词末尾（宿主扩展用，如世界书/额外规则） */
  extraSystemPrompt?: string;
}

export interface OpenAiCompatibleCognition extends Cognition {
  /** Q5 桥接取用点：composition 本地 duck-typed 只读访问 persona */
  readonly persona: PersonaCardV3;
}

export interface LlmReply {
  emotion?: string;
  intensity?: number;
  speech?: string;
}

/** 解析 LLM 返回：JSON（兼容旧格式）→ 标记行格式 → 兜底整段当台词（导出供测试） */
export function parseReply(raw: string): LlmReply {
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
  // 2) 标记行格式：允许 [EMOTION] 一行 + 自由台词（无 [SPEECH] 标记时，其余文本即台词）
  const emotion = body.match(/\[EMOTION\]\s*([^\r\n]+)/i)?.[1]?.trim();
  const intensityRaw = body.match(/\[INTENSITY\]\s*([^\r\n]+)/i)?.[1]?.trim();
  let speech = body.match(/\[SPEECH\]\s*([\s\S]*)$/i)?.[1]?.trim();
  if (speech === undefined && emotion !== undefined) {
    // 去掉 [EMOTION]/[INTENSITY] 行后，剩余文本作为台词
    const rest = body
      .replace(/\[EMOTION\][^\r\n]*/gi, "")
      .replace(/\[INTENSITY\][^\r\n]*/gi, "")
      .trim();
    if (rest !== "") speech = rest;
  }
  if (emotion !== undefined || speech !== undefined) {
    return { emotion, intensity: Number(intensityRaw), speech: speech === "" ? undefined : speech };
  }
  // 3) 兜底：整段当台词，情绪 neutral
  return { speech: body };
}

/** system 提示词（导出供测试/扩展） */
export function buildSystemPrompt(persona: PersonaCardV3, extra?: string): string {
  const p = persona;
  return [
    `你是「${p.data.name}」，一个真实存在的人。`,
    p.data.description ? `设定：${p.data.description}` : "",
    p.data.personality ? `性格：${p.data.personality}` : "",
    p.data.scenario ? `场景：${p.data.scenario}` : "",
    p.data.first_mes ? `示例开场白：${p.data.first_mes}` : "",
    p.data.mes_example ? `对话风格参考（模仿这种语气和长度）：\n${p.data.mes_example}` : "",
    `对话规则：`,
    `1. 像真人一样自然回答用户，先想清楚再开口；正常长度 1~3 句话，不要只说一两个词，也不要复述用户的话。`,
    `2. 回答前先输出一行情绪词：[EMOTION] calm（从 happy/sad/angry/neutral/surprised/calm 中选一个）。`,
    `3. 换行后直接输出台词，台词前不要加任何前缀或标记。`,
    `示例：`,
    `用户：这么晚还在看书？`,
    `[EMOTION] calm`,
    `嗯。月光正好，适合读书。你呢，怎么还没睡？`,
    extra ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 组装消息：system → 记忆历史 → 当前输入（导出供测试） */
export function buildMessages(
  input: CognitionInput,
  persona: PersonaCardV3,
  extraSystemPrompt?: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt(persona, extraSystemPrompt) },
  ];
  // 记忆（多轮上下文）：pipeline 已把 MemoryStore.recall 结果放进 input.recall
  for (const item of input.recall?.items ?? []) {
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content,
    });
  }
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

export function createOpenAiCompatibleCognition(
  opts: OpenAiCompatibleCognitionOptions,
): OpenAiCompatibleCognition {
  const baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
  const model = opts.model ?? "qwen3:8b";
  const apiKey = opts.apiKey;
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 512;
  const extraSystemPrompt = opts.extraSystemPrompt;
  let logger: Logger | undefined;

  return {
    id: "cognition:llm",
    persona: opts.persona,
    async mount(ctx: CognitionContext): Promise<void> {
      logger = ctx.logger;
      void ctx.clock;
    },
    async *onInput(input: CognitionInput): AsyncGenerator<CognitionOutput> {
      const messages = buildMessages(input, opts.persona, extraSystemPrompt);
      logger?.info("llm.request", { model, baseUrl, turns: messages.length });
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
      const intensity = Number.isNaN(rawIntensity) ? 0.5 : Math.min(1, Math.max(0, rawIntensity));
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
