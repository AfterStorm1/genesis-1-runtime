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
    // 声线基调：低音区（pitch -5Hz，晓晓底子薄所以只降不厚）、偏慢（rate -12%）——「三无冷淡少女低音」
    rate: process.env.TTS_EDGE_RATE ?? "-12%",
    pitch: process.env.TTS_EDGE_PITCH ?? "-5Hz",
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

export function createTtsEngine(force?: "edge" | "cloud" | "off"): TtsEngine {
  const edge = resolveEdgeTtsConfig();
  const cloud = createCloudTts();
  const forced = force ?? process.env.TTS_ENGINE ?? "edge"; // edge | cloud | off
  let ready: Promise<boolean> | null = null;
  let logged = false;

  if (forced === "cloud") {
    if (!logged) {
      logged = true;
      // eslint-disable-next-line no-console
      console.log("[tts] TTS_ENGINE=cloud：直走云端（GPT-SoVITS/CosyVoice + 克隆音色）");
    }
    return {
      async synthesizeToFile(text, outPath, opts) {
        return cloud.synthesizeToFile(text, outPath, opts);
      },
    };
  }
  if (forced === "off") {
    return {
      async synthesizeToFile() {
        return null;
      },
    };
  }

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

  const runEdge = (textFile: string, out: string, rate: string, pitch: string, voice: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const script = path.join(process.cwd(), "scripts", "tts-edge.py");
      const p = spawn(edge.python, [script, textFile, out, voice, rate, pitch], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      p.stderr?.on("data", (d: Buffer) => {
        err += d.toString("utf8");
      });
      p.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`edge_tts_exit_${code ?? "?"}: ${err.trim().split(/\r?\n/).slice(-6).join(" | ").slice(-600)}`));
      });
      p.on("error", (e) => reject(e));
    });

  return {
    async synthesizeToFile(text: string, outPath: string, opts?: { emotion?: string }): Promise<string | null> {
      if (await ensureReady()) {
        if (!logged) {
          logged = true;
          // eslint-disable-next-line no-console
          console.log("[tts] Edge 引擎就绪（微软免费语音）");
        }
        try {
          const textFile = path.join(runtimeTmpDir(), `tts-text-${Date.now()}.txt`);
          fs.writeFileSync(textFile, text, "utf8");
          const rate = opts?.emotion !== undefined ? emotionRate(opts.emotion) : edge.rate;
          try {
            await runEdge(textFile, outPath, rate, edge.pitch, edge.voice);
          } catch (firstErr) {
            if (edge.pitch !== "+0Hz") {
              // 音高参数被拒时自动重试默认音高（NoAudioReceived 常见于此）
              // eslint-disable-next-line no-console
              console.warn(`[tts] Edge 带音高失败，重试默认音高：${firstErr instanceof Error ? firstErr.message.slice(0, 120) : ""}`);
              await runEdge(textFile, outPath, rate, "+0Hz", edge.voice);
            } else if (edge.voice !== "zh-CN-XiaoxiaoNeural") {
              // 音色名服务端不认（新一批音色如晓涵/晓梦不可用）：兜底晓晓
              // eslint-disable-next-line no-console
              console.warn("[tts] 配置音色不可用，兜底晓晓（zh-CN-XiaoxiaoNeural）");
              await runEdge(textFile, outPath, rate, "+0Hz", "zh-CN-XiaoxiaoNeural");
            } else {
              throw firstErr;
            }
          }
          return outPath;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[tts] Edge 合成失败，落回云端：${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (!logged) {
        logged = true;
        // eslint-disable-next-line no-console
        console.warn("[tts] Edge 不可用，使用云端兜底。装 Edge：tools\\whisper-py\\Scripts\\python.exe -m pip install edge-tts -i https://pypi.tuna.tsinghua.edu.cn/simple");
      }
      return cloud.synthesizeToFile(text, outPath, opts);
    },
  };
}
