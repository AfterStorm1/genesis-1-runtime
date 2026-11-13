// Genesis-1 · 音频后处理（值级）：体检 / 拼接 / 慢放 / 垫静音
import { spawn } from "node:child_process";
import path from "node:path";

/** 音频体检测试结果（静音、半句、尾音被硬切都靠它判） */
export interface AudioStat {
  ok: boolean;
  reason?: string;
  sampleRate?: number;
  duration?: number;
  peak?: number;
  /** 开头静音时长（秒） */
  headSilence?: number;
  /** 结尾静音时长（秒）；极小 = 尾音被硬切 */
  tailSilence?: number;
  /** 首个有声 → 最后一个有声的跨度（秒） */
  voiced?: number;
}

function pythonExe(): string {
  return process.env.TTS_PYTHON ?? path.join(process.cwd(), "tools", "whisper-py", "Scripts", "python.exe");
}

/** 跑一个 python 脚本并收集输出（多个后处理脚本共用） */
function runPython(
  args: string[],
  onFail: (stderr: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(pythonExe(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    p.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    p.on("exit", (code) => {
      if (code !== 0) onFail(stderr);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    p.on("error", (err) => {
      onFail(String(err));
      resolve({ code: -1, stdout, stderr });
    });
  });
}

/** 读音频时长（秒）；失败返回 null */
export function audioDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn(
      pythonExe(),
      [
        "-c",
        "import av,sys; c=av.open(sys.argv[1]); s=c.streams.audio[0]; print(round(float(s.duration*s.time_base),3))",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let stdout = "";
    p.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    p.on("exit", (code) => {
      if (code === 0) {
        const n = Number(stdout.trim());
        resolve(Number.isFinite(n) ? n : null);
      } else {
        resolve(null);
      }
    });
    p.on("error", () => resolve(null));
  });
}

/** 音频体检：时长 / 峰值 / 首尾静音 / 有效语音跨度；文件坏了返回 null */
export async function inspectAudio(filePath: string): Promise<AudioStat | null> {
  const r = await runPython(
    [path.join(process.cwd(), "scripts", "audio-inspect.py"), filePath],
    (stderr) => {
      // eslint-disable-next-line no-console
      console.warn(`[tts] 体检失败：${stderr.slice(-200)}`);
    },
  );
  if (r.code !== 0) return null;
  const line = r.stdout.trim().split(/\r?\n/).pop() ?? "";
  try {
    return JSON.parse(line) as AudioStat;
  } catch {
    return null;
  }
}

/** 重采样慢放（音高随之下沉，零电音）：合成保持原速，后期再慢放 */
export async function timeStretchFile(inputPath: string, tempo: number): Promise<string | null> {
  const out = inputPath.replace(/\.(mp3|wav)$/i, "") + `-slow${Math.round(tempo * 100)}.wav`;
  const r = await runPython([path.join(process.cwd(), "scripts", "audio-atempo.py"), inputPath, out, String(tempo)], (stderr) => {
    // eslint-disable-next-line no-console
    console.warn(`[tts] atempo 慢放失败（直接发原音频）：${stderr.slice(-200)}`);
  });
  if (r.code !== 0) return null;
  const m = r.stdout.match(/ok\s+(.+)$/m);
  return m?.[1]?.trim() ?? out;
}

/** 多段音频按序拼接，句间插入静音（断句节奏可控），统一 24k 无损 wav */
export async function concatAudio(files: string[], gapSeconds: number): Promise<string | null> {
  if (files.length === 0) return null;
  const out = path.join(path.dirname(files[0]!), `qq-voice-joined-${Date.now()}.wav`);
  const r = await runPython(
    [path.join(process.cwd(), "scripts", "audio-concat.py"), String(gapSeconds), out, ...files],
    (stderr) => {
      // eslint-disable-next-line no-console
      console.warn(`[tts] 音频拼接失败（含坏文件已跳过）：${stderr.slice(-200)}`);
    },
  );
  if (r.code !== 0) return null;
  const m = r.stdout.match(/ok\s+(\S+)/);
  return m?.[1]?.trim() ?? out;
}

/**
 * 头尾垫静音：头部吃掉客户端“起播未热”的损失，尾部防播放器/转码截断尾音。
 * 顺带统一采样率（默认 24000，silk 原生）与峰值（默认 -1.9dBFS）。
 */
export async function padSilenceFile(
  inputPath: string,
  seconds = 0.5,
  opts?: { leadSeconds?: number; sampleRate?: number; peak?: number },
): Promise<string | null> {
  const out = inputPath.replace(/\.mp3$|\.wav$/i, "") + "-padded.mp3";
  const lead = opts?.leadSeconds ?? 0;
  const rate = opts?.sampleRate ?? 0;
  const peak = opts?.peak ?? 0;
  const r = await runPython(
    [
      path.join(process.cwd(), "scripts", "audio-pad.py"),
      inputPath,
      out,
      String(seconds),
      String(lead),
      String(rate),
      String(peak),
    ],
    (stderr) => {
      // eslint-disable-next-line no-console
      console.warn(`[tts] 垫静音失败（直接发原音频）：${stderr.slice(0, 120)}`);
    },
  );
  if (r.code !== 0) return null;
  const m = r.stdout.match(/ok\s+(.+)$/m);
  return m?.[1]?.trim() ?? out;
}
