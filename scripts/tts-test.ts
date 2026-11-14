// TTS 冒烟测试：用当前配置合成一句台词，看接口是否正常（排查音色/参数问题用）
// 用法：
//   tts-test.cmd                    合成默认台词
//   tts-test.cmd "<自定义台词>"      合成你给的台词（日语表演标签可直接写上）
//   TTS_TEST_TEXT 环境变量同样生效
import { createTtsEngine } from "../adapters/tts/edge-tts";
import path from "node:path";

async function main(): Promise<void> {
  const out = path.join(process.cwd(), "data", "tmp", "tts-test.mp3");
  const engine = createTtsEngine();
  const text =
    process.argv[2]?.trim() ??
    process.env.TTS_TEST_TEXT?.trim() ??
    "[少し嬉しそうに、声を弾ませて] ねえねえ、聞いて。今日ね、いいことあったんだ。[息を吸う] ちょっとだけ、聞いてくれる？";
  const t0 = Date.now();
  const made = await engine.synthesizeToFile(text, out);
  console.log(`engine=${process.env.TTS_ENGINE ?? "cloud"} elapsed=${Date.now() - t0}ms`);
  console.log(made !== null ? `ok -> ${made}` : "failed（日志见上方）");
}

void main();
