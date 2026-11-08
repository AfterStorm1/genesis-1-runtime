// Genesis-1 · 交互式聊天 demo（本地 Ollama / 在线 OpenAI 兼容 API 双模式）
// 用法：node node_modules\tsx\dist\cli.mjs demo-chat.ts
// 环境变量：
//   GENESIS_PERSONA   人格卡路径（默认 config/persona/example.persona.json）
//   —— 本地模式（未设置 LLM_API_KEY 时，默认）——
//   OLLAMA_MODEL      默认 qwen2.5:7b    OLLAMA_BASE_URL 默认 http://localhost:11434
//   —— 在线模式（设置 LLM_API_KEY 后自动切换）——
//   LLM_API_KEY       必填               LLM_BASE_URL 默认 https://api.deepseek.com
//   LLM_MODEL         默认 deepseek-chat
// 功能：终端打字 → 人格卡+LLM → 情绪+台词走完整管线 → 打印角色回复。
import path from "node:path";
import readline from "node:readline";
import { compose } from "./composition/composition-root";
import { loadPersona } from "./layers/l1-persona/persona-loader";
import { createOpenAiCompatibleCognition } from "./adapters/llm/ollama-cognition";
import { createMockSpeechRenderer } from "./adapters/renderers/mock-speech-renderer";
import { createTextRenderer } from "./adapters/renderers/text-renderer";

async function main(): Promise<void> {
  const personaPath =
    process.env.GENESIS_PERSONA !== undefined
      ? path.resolve(process.env.GENESIS_PERSONA)
      : path.join(process.cwd(), "config", "persona", "example.persona.json");
  const persona = loadPersona(personaPath);

  // 双模式：有 LLM_API_KEY 走在线 API；否则走本地 Ollama
  const apiKey = process.env.LLM_API_KEY;
  const online = apiKey !== undefined && apiKey !== "";
  const model = online
    ? (process.env.LLM_MODEL ?? "deepseek-chat")
    : (process.env.OLLAMA_MODEL ?? "qwen2.5:7b");
  const baseUrl = online
    ? (process.env.LLM_BASE_URL ?? "https://api.deepseek.com")
    : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434");

  // eslint-disable-next-line no-console
  console.log(`[llm] mode=${online ? "online" : "local-ollama"} model=${model} baseUrl=${baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[persona] loaded: ${persona.data.name}`);

  const rt = await compose({
    runtimeId: "rt:chat",
    personaId: "persona:chat",
    frameHz: 10,
    renderers: [createTextRenderer(), createMockSpeechRenderer()],
    parameters: [],
    cognition: createOpenAiCompatibleCognition({ persona, model, baseUrl, apiKey }),
    batchTimeoutMs: 120_000, // 本地 LLM（CPU 推理）延迟远高于默认 2s 批次超时
  });

  let pending: { resolve: (text: string | null) => void } | null = null;
  rt.arbiter.onDispatch((s) => {
    // L4 只读 sanitizedText.text（D20）；这里作为宿主侧展示读取
    const text = s.speech?.sanitizedText?.text ?? null;
    if (pending !== null) {
      const p = pending;
      pending = null;
      p.resolve(text);
    }
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

  // eslint-disable-next-line no-console
  console.log(`\n与「${persona.data.name}」聊天开始（输入 /quit 退出）\n`);

  for (;;) {
    const line = await ask("你 > ");
    if (line.trim() === "/quit" || line.trim() === "/exit") break;
    if (line.trim() === "") continue;
    const answer = new Promise<string | null>((resolve) => {
      pending = { resolve };
    });
    rt.inputBus.inject({ kind: "user_message", text: line });
    const reply = await Promise.race([
      answer,
      new Promise<string | null>((r) => setTimeout(() => r(null), 120_000)),
    ]);
    if (reply === null) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} > （超时或本句只有情绪无台词）`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} > ${reply}`);
    }
  }

  rl.close();
  await rt.dispose();
  // eslint-disable-next-line no-console
  console.log("已退出。");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
