// Genesis-1 · Edge TTS 引擎（值级；微软“大声朗读”同款，免费免 key，音质顶级）
// 首选引擎；不可用（未装 edge-tts 包/调用失败）时自动落回云端 TTS（SiliconFlow）。
// 音色：zh-CN-XiaoxiaoNeural（晓晓·温柔女声，默认）/ zh-CN-XiaoyiNeural（晓伊·活泼少女）
//       zh-CN-YunxiNeural（云希）/ zh-CN-XiaochenNeural（晓辰）等。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createCloudTts, emotionHint } from "./cloud-tts";
import { runtimeTmpDir } from "../stt/whisper-engine";

export interface EdgeTtsConfig {
  voice: string;
  rate: string;
  pitch: string;
  python: string;
}

export function resolveEdgeTtsConfig(): EdgeTtsConfig {
  return {
    voice: process.env.TTS_EDGE_VOICE ?? "zh-CN-XiaoxiaoNeural",
    // 声线基调：低音区（pitch -3Hz）、偏慢（rate -12%）——「三无冷淡少女低音」的参数逼近
    rate: process.env.TTS_EDGE_RATE ?? "-12%",
    pitch: process.env.TTS_EDGE_PITCH ?? "-3Hz",
    python:
      process.env.TTS_PYTHON ?? path.join(process.cwd(), "tools", "whisper-py", "Scripts", "python.exe"),
  };
}

/** 情绪 → 语速（Edge 不支持情绪指令，用语速模拟）（导出供测试） */
export function emotionRate(emotion: string): string {
  switch (emotion) {
    case "happy":
      return "+10%";
    case "sad":
      return "-12%";
    case "angry":
      return "+6%";
    default:
      return "+0%";
  }
}

export interface TtsEngine {
  /** 合成语音到本地文件，成功返回路径，失败返回 null；emotion 会映射为对应语气/语速 */
  synthesizeToFile(text: string, outPath: string, opts?: { emotion?: string }): Promise<string | null>;
}

export function createTtsEngine(): TtsEngine {
  const edge = resolveEdgeTtsConfig();
  const cloud = createCloudTts();
  let ready: Promise<boolean> | null = null;

  const ensureReady = (): Promise<boolean> => {
    if (ready === null) {
      ready = new Promise((resolve) => {
        const p = spawn(edge.python, ["-c", "import edge_tts"], { stdio: "ignore" });
        p.on("exit", (code) => resolve(code === 0));
        p.on("error", () => resolve(false));
      });
    }
    return ready;
  };

  const runEdge = (textFile: string, out: string, rate: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const script = path.join(process.cwd(), "scripts", "tts-edge.py");
      const p = spawn(edge.python, [script, textFile, out, edge.voice, rate, edge.pitch], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      p.stderr?.on("data", (d: Buffer) => {
        err += d.toString("utf8");
      });
      p.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`edge_tts_exit_${code ?? "?"}: ${err.slice(0, 160)}`));
      });
      p.on("error", (e) => reject(e));
    });

  return {
    async synthesizeToFile(text: string, outPath: string, opts?: { emotion?: string }): Promise<string | null> {
      if (await ensureReady()) {
        try {
          const textFile = path.join(runtimeTmpDir(), `tts-text-${Date.now()}.txt`);
          fs.writeFileSync(textFile, text, "utf8");
          const rate = opts?.emotion !== undefined ? emotionRate(opts.emotion) : edge.rate;
          await runEdge(textFile, outPath, rate);
          return outPath;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[tts] Edge 合成失败，落回云端：${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return cloud.synthesizeToFile(
        text,
        outPath,
        opts?.emotion !== undefined ? { emotionHint: emotionHint(opts.emotion) } : undefined,
      );
    },
  };
}
