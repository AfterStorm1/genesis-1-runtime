// TTS 冒烟测试：用当前配置合成一句“测试”，看接口是否正常（排查音色/参数问题用）
import { createCloudTts } from "../adapters/tts/cloud-tts";
import { createTtsEngine } from "../adapters/tts/edge-tts";
import path from "node:path";

async function main(): Promise<void> {
  const out = path.join(process.cwd(), "data", "tmp", "tts-test.mp3");
  const engine = createTtsEngine();
  const made = await engine.synthesizeToFile("这是一条测试。", out);
  console.log(made !== null ? `ok -> ${made}` : "failed（日志见上方）");
  void createCloudTts;
}

void main();
