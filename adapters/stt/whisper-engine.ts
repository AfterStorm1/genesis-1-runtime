// Genesis-1 · whisper.cpp 转写引擎（TranscriberCore 实现，值级；零 npm 依赖）
// 文件模式：ffmpeg → 16k wav → whisper-cli -otxt（离线，中文）
// 流模式：whisper-stream（VAD 分段持续识别，可指定捕获设备=立体声混音/虚拟声卡）
// 安装：tools/whisper/{whisper-cli.exe, whisper-stream.exe, ggml-*.bin} + tools/ffmpeg/ffmpeg.exe
//      或用环境变量 WHISPER_BIN / WHISPER_STREAM_BIN / WHISPER_MODEL / FFMPEG_BIN 指定路径。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { EngineProbe, StreamHandle, TranscriberCore, Utterance } from "./transcriber-core";
import type { VoiceSource } from "./voice-source";

export const WHISPER_DOWNLOAD_HINTS = {
  whisper:
    "下载 whisper.cpp 预编译包（含 whisper-cli 与 whisper-stream）：https://github.com/ggml-org/whisper.cpp/releases，解压出 exe 放进 tools/whisper/",
  model:
    "下载中文模型 ggml-base.bin（约 140MB，速度快）或 ggml-small.bin（约 460MB，更准）：https://huggingface.co/ggml-org/whisper.cpp（国内可用 hf-mirror.com 镜像），放进 tools/whisper/",
  ffmpeg:
    "下载 ffmpeg 免安装包（essentials 即可）：https://www.gyan.dev/ffmpeg/builds/，解压出 ffmpeg.exe 放进 tools/ffmpeg/",
};

export interface WhisperEngineOptions {
  whisperBin?: string;
  streamBin?: string;
  modelPath?: string;
  ffmpegBin?: string;
  /** 识别语言，默认 zh */
  lang?: string;
  /** 流模式线程数（默认 4） */
  threads?: number;
}

function toolsDir(): string {
  return path.join(process.cwd(), "tools");
}

/** 解析各组件路径：环境变量 > tools/ 默认目录 */
export function resolveEnginePaths(opts?: WhisperEngineOptions): WhisperEngineOptions & { lang: string; threads: number } {
  return {
    whisperBin: opts?.whisperBin ?? process.env.WHISPER_BIN ?? path.join(toolsDir(), "whisper", "whisper-cli.exe"),
    streamBin: opts?.streamBin ?? process.env.WHISPER_STREAM_BIN ?? path.join(toolsDir(), "whisper", "whisper-stream.exe"),
    modelPath: opts?.modelPath ?? process.env.WHISPER_MODEL ?? path.join(toolsDir(), "whisper", "ggml-small.bin"),
    ffmpegBin: opts?.ffmpegBin ?? process.env.FFMPEG_BIN ?? path.join(toolsDir(), "ffmpeg", "ffmpeg.exe"),
    lang: opts?.lang ?? process.env.WHISPER_LANG ?? "zh",
    threads: opts?.threads ?? (Number(process.env.WHISPER_THREADS) || 4),
  };
}

/** 引擎安装探测（导出供测试） */
export function probeEngine(opts?: WhisperEngineOptions): EngineProbe {
  const p = resolveEnginePaths(opts);
  const whisper = p.whisperBin !== undefined && fs.existsSync(p.whisperBin);
  const stream = p.streamBin !== undefined && fs.existsSync(p.streamBin);
  const model = p.modelPath !== undefined && fs.existsSync(p.modelPath);
  const ffmpeg = p.ffmpegBin !== undefined && fs.existsSync(p.ffmpegBin);
  const hints: string[] = [];
  if (!whisper) hints.push(WHISPER_DOWNLOAD_HINTS.whisper);
  if (!stream) hints.push(WHISPER_DOWNLOAD_HINTS.whisper.replace("（含 whisper-cli 与 whisper-stream）", "（whisper-stream.exe）"));
  if (!model) hints.push(WHISPER_DOWNLOAD_HINTS.model);
  if (!ffmpeg) hints.push(WHISPER_DOWNLOAD_HINTS.ffmpeg);
  return { ok: whisper && stream && model && ffmpeg, whisper, stream, model, ffmpeg, hints };
}

/** ffmpeg 转码参数（导出供测试） */
export function buildFfmpegArgs(input: string, outWav: string): string[] {
  return ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outWav];
}

/** whisper-cli 文件转写参数（导出供测试）：16k wav → 无时间戳 txt */
export function buildWhisperFileArgs(model: string, wav: string, lang: string, outPrefix: string): string[] {
  return ["-m", model, "-f", wav, "-l", lang, "-otxt", "-of", outPrefix, "-nt"];
}

/** whisper-stream 流式参数（导出供测试）；deviceId 对应 -c 捕获设备（立体声混音等） */
export function buildWhisperStreamArgs(
  model: string,
  lang: string,
  threads: number,
  deviceId?: number,
): string[] {
  const args = ["-m", model, "-l", lang, "-t", String(threads), "--step", "3000", "--length", "10000"];
  if (deviceId !== undefined) args.push("-c", String(deviceId));
  return args;
}

/** 解析 whisper-stream 输出行：去时间戳/空行（导出供测试） */
export function parseStreamLine(line: string): string | null {
  const t = line.replace(/\[[^\]]*\]/g, "").trim();
  if (t === "" || /^(whisper_|main:|init:|system)/i.test(t)) return null;
  return t;
}

function runQuiet(cmd: string, args: string[], cwd?: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, out }));
  });
}

export interface WhisperCppEngine extends TranscriberCore {
  paths: ReturnType<typeof resolveEnginePaths>;
}

export function createWhisperCppEngine(opts?: WhisperEngineOptions): WhisperCppEngine {
  const paths = resolveEnginePaths(opts);

  return {
    paths,
    probe: () => probeEngine(opts),
    async transcribeFile(source: VoiceSource): Promise<string> {
      const probe = probeEngine(opts);
      if (!probe.whisper || !probe.model || !probe.ffmpeg) {
        throw new Error(`语音转写引擎未安装：${probe.hints.join(" ")}`);
      }
      if (source.filePath === undefined || !fs.existsSync(source.filePath)) {
        throw new Error(`音频文件不存在：${source.filePath ?? "（未提供路径）"}`);
      }
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-stt-"));
      const wav = path.join(tmpDir, "audio.wav");
      const outPrefix = path.join(tmpDir, "out");
      try {
        const ff = await runQuiet(paths.ffmpegBin!, buildFfmpegArgs(source.filePath, wav));
        if (ff.code !== 0) throw new Error(`ffmpeg 转码失败(code ${ff.code}): ${ff.out.slice(-300)}`);
        const wh = await runQuiet(paths.whisperBin!, buildWhisperFileArgs(paths.modelPath!, wav, paths.lang, outPrefix));
        const txtFile = `${outPrefix}.txt`;
        if (wh.code !== 0 && !fs.existsSync(txtFile)) {
          throw new Error(`whisper 转写失败(code ${wh.code}): ${wh.out.slice(-300)}`);
        }
        return fs.existsSync(txtFile) ? fs.readFileSync(txtFile, "utf8").trim() : "";
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    transcribeStream(source: VoiceSource, onUtterance: (u: Utterance) => void): StreamHandle | null {
      const probe = probeEngine(opts);
      if (!probe.stream || !probe.model) {
        // eslint-disable-next-line no-console
        console.warn("[stt] 流式引擎未安装：" + probe.hints.join(" "));
        return null;
      }
      const child: ChildProcess = spawn(paths.streamBin!, buildWhisperStreamArgs(paths.modelPath!, paths.lang, paths.threads, source.deviceId));
      let stopped = false;
      child.stdout?.on("data", (d: Buffer) => {
        for (const line of d.toString("utf8").split(/\r?\n/)) {
          const text = parseStreamLine(line);
          if (text !== null) onUtterance({ text, ts: Date.now(), sourceLabel: source.label });
        }
      });
      child.on("error", (err) => {
        if (!stopped) {
          // eslint-disable-next-line no-console
          console.error("[stt] whisper-stream 启动失败：" + (err as Error).message);
        }
      });
      child.on("exit", (code) => {
        if (!stopped) {
          // eslint-disable-next-line no-console
          console.log(`[stt] whisper-stream 退出（code ${code ?? "?"}）`);
        }
      });
      return {
        stop() {
          stopped = true;
          child.kill();
        },
      };
    },
  };
}
