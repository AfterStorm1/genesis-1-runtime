// Genesis-1 · 对话摘要器（长期记忆提炼，值级）
// 复用与认知适配器相同的 OpenAI 兼容端点，把最近若干轮对话提炼成
// 「值得长期记住的事实」清单，交给 long-term-memory 入库。
import { chatOnce } from "./openai-compatible-cognition";

export interface SummarizerOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface Summarizer {
  /** 输入对话文本（形如 "用户：...\n角色：..."），返回提炼条目列表（可能为空） */
  summarize(dialogue: string): Promise<string[]>;
}

/** 解析 LLM 输出：每行一条；忽略 "- " 前缀与空行；「无/没有」类答复返回空（导出供测试） */
export function parseMemoryLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, "").trim();
    if (t === "") continue;
    if (/^(无|没有|暂无|none|nothing)$/i.test(t)) continue;
    out.push(t);
  }
  return out;
}

export function createSummarizer(opts: SummarizerOptions): Summarizer {
  return {
    async summarize(dialogue: string): Promise<string[]> {
      const messages = [
        {
          role: "system",
          content:
            "你是记忆助手。从对话中提炼「值得长期记住」的信息：对方的称呼/名字、喜好与厌恶、做过的约定、重要事件。每条一行，只输出事实本身，不要编号和解释；无关紧要的事不要输出；确实没有就输出「无」。",
        },
        { role: "user", content: dialogue },
      ];
      const raw = await chatOnce({
        baseUrl: opts.baseUrl,
        model: opts.model,
        apiKey: opts.apiKey,
        messages,
        temperature: 0.2,
        maxTokens: 400,
      });
      return parseMemoryLines(raw);
    },
  };
}
