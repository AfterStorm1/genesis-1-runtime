// Genesis-1 · 音频垫静音（值级）：TTS 结果末尾追加静音，防 QQ 播放器截断尾音
import { spawn } from "node:child_process";
import path from "node:path";

export function padSilenceFile(inputPath: string, seconds = 0.5): Promise<string | null> {
  return new Promise((resolve) => {
    const python =
      process.env.TTS_PYTHON ?? path.join(process.cwd(), "tools", "whisper-py", "Scripts", "python.exe");
    const out = inputPath.replace(/\.mp3$|\.wav$/i, "") + "-padded.mp3";
    const script = path.join(process.cwd(), "scripts", "audio-pad.py");
    const p = spawn(python, [script, inputPath, out, String(seconds)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    p.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    p.on("exit", (code) => {
      if (code === 0) {
        const m = stdout.match(/ok\s+(.+)$/m);
        resolve(m?.[1]?.trim() ?? out);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[tts] 垫静音失败（直接发原音频）：${stderr.slice(0, 120)}`);
        resolve(null);
      }
    });
    p.on("error", () => resolve(null));
  });
}
