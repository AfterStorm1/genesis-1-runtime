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

/** cmd 批处理可能吞掉行尾的 %（"-5%" 变成 "-5"）：归一化补全（导出供测试） */
export function normalizeRate(v: string): string {
  if (/^[+-]\d+%$/.test(v)) return v;
  if (/^[+-]\d+$/.test(v)) return `${v}%`;
  return "+0%";
}

export function normalizePitch(v: string): string {
  if (/^[+-]\d+Hz$/.test(v)) return v;
  if (/^[+-]\d+$/.test(v)) return `${v}Hz`;
  return "+0Hz";
}

export function resolveEdgeTtsConfig(): EdgeTtsConfig {
  return {
    voice: process.env.TTS_EDGE_VOICE ?? "zh-CN-XiaoxiaoNeural",
    // 声线基调：低音区（pitch -3Hz，晓晓底子薄所以只降不厚）、偏慢（rate -12%）——「三无冷淡少女低音」
    rate: normalizeRate(process.env.TTS_EDGE_RATE ?? "-12%"),
    pitch: normalizePitch(process.env.TTS_EDGE_PITCH ?? "-3Hz"),
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
  const cloud = createCloudTts();
  // 语音引擎：只走云端（克隆音色/CosyVoice）。微软 Edge 已按需求移除，不再作为任何兜底。
  // TTS_ENGINE=off 可整体关闭语音合成（回复自动落回文字）。
  if ((process.env.TTS_ENGINE ?? "cloud") === "off") {
    return {
      async synthesizeToFile() {
        return null;
      },
    };
  }
  return {
    async synthesizeToFile(text, outPath, opts) {
      return cloud.synthesizeToFile(text, outPath, opts);
    },
  };
}
