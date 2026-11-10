// Genesis-1 · 对话摘要器（长期记忆提炼，值级）
// 复用与认知适配器相同的 OpenAI 兼容端点，一次调用同时提炼两节：
//   [事实] —— 值得长期记住的客观信息（称呼/喜好/约定/事件）→ long-term-memory
//   [感受] —— 角色第一人称的相处感受（情绪词：内容）→ feeling-memory（感受层）
import { chatOnce } from "./openai-compatible-cognition";

export interface SummarizerOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface FeelingExtract {
  text: string;
  emotion: string;
}

export interface SummarizeResult {
  facts: string[];
  feelings: FeelingExtract[];
}

export interface Summarizer {
  /** 输入对话文本（形如 "用户：...\n角色：..."），返回事实与第一人称感受 */
  summarize(dialogue: string): Promise<SummarizeResult>;
}

/** 解析 [事实] 节：每行一条；忽略 "- " 前缀与空行；「无/没有」类答复返回空（导出供测试） */
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

/** 解析 [感受] 节：每行「情绪词：内容」；无情绪词前缀时按 neutral 收编（导出供测试） */
export function parseFeelings(raw: string): FeelingExtract[] {
  const out: FeelingExtract[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, "").trim();
    if (t === "") continue;
    if (/^(无|没有|暂无|none|nothing)$/i.test(t)) continue;
    const m = t.match(/^([^：:]{1,8})[：:]\s*(.+)$/);
    if (m !== null) {
      out.push({ emotion: m[1]!.trim(), text: m[2]!.trim() });
    } else {
      out.push({ emotion: "neutral", text: t });
    }
  }
  return out;
}

export function createSummarizer(opts: SummarizerOptions): Summarizer {
  return {
    async summarize(dialogue: string): Promise<SummarizeResult> {
      const messages = [
        {
          role: "system",
          content:
            "你是记忆助手。从对话中提炼两部分：\n" +
            "[事实]\n值得长期记住的信息：对方的称呼/名字、喜好与厌恶、做过的约定、重要事件。每条一行，只写事实；无关紧要的不写；没有就写「无」。\n" +
            "[感受]\n角色以第一人称回忆这段相处带来的感受，每条一行，格式「情绪词：内容」，情绪词限 calm/happy/sad/angry/surprised/neutral；只写真切的感受，没有就写「无」。\n" +
            "严格按上述两个小节标题输出。",
        },
        { role: "user", content: dialogue },
      ];
      const raw = await chatOnce({
        baseUrl: opts.baseUrl,
        model: opts.model,
        apiKey: opts.apiKey,
        messages,
        temperature: 0.2,
        maxTokens: 500,
      });
      const factsPart = raw.match(/\[事实\][\s\S]*?(?=\[感受\]|$)/i)?.[1] ?? "";
      const feelPart = raw.match(/\[感受\][\s\S]*$/i)?.[1] ?? "";
      // 兼容旧格式（无小节标题时整段按事实解析）
      const facts = factsPart.trim() !== "" ? parseMemoryLines(factsPart) : parseMemoryLines(raw);
      return { facts, feelings: parseFeelings(feelPart) };
    },
  };
}
