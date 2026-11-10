// whisper.cpp 引擎：参数构建 / 输出解析 / 安装探测（值级扩展测试；真实转写需用户安装引擎）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  buildRecordArgs,
  buildWhisperFileArgs,
  buildWhisperStreamArgs,
  parseStreamLine,
  probeEngine,
} from "../../adapters/stt/whisper-engine";
import { writeEvidenceLog } from "../helpers/evidence";

describe("whisper engine (arg building + probe)", () => {
  it("录音参数：venv python → whisper-stt.py record，秒数经环境变量传入", () => {
    const r = buildRecordArgs("D:/x/python.exe", "D:/x/out.wav", 8);
    expect(r.cmd).toBe("D:/x/python.exe");
    expect(r.args[1]).toBe("record");
    expect(r.args[2]).toBe("D:/x/out.wav");
    expect(r.env.STT_RECORD_SECONDS).toBe("8");
  });
  it("ffmpeg 转码参数：16k 单声道 pcm wav", () => {
    expect(buildFfmpegArgs("a.amr", "b.wav")).toEqual([
      "-y", "-i", "a.amr", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "b.wav",
    ]);
  });

  it("whisper-cli 文件参数：模型/语言/无时间戳 txt 输出", () => {
    const args = buildWhisperFileArgs("m.bin", "a.wav", "zh", "out");
    expect(args).toContain("-m");
    expect(args).toContain("m.bin");
    expect(args).toContain("-l");
    expect(args).toContain("zh");
    expect(args).toContain("-otxt");
    expect(args).toContain("-nt");
  });

  it("whisper-stream 参数：语言/线程/步长；有设备号时带 -c", () => {
    const args = buildWhisperStreamArgs("m.bin", "zh", 4, 2);
    expect(args).toContain("-t");
    expect(args).toContain("4");
    expect(args).toContain("-c");
    expect(args).toContain("2");
    expect(buildWhisperStreamArgs("m.bin", "zh", 4)).not.toContain("-c");
  });

  it("parseStreamLine：去时间戳与空行/系统行", () => {
    expect(parseStreamLine("[00:00:01.000 --> 00:00:03.000]  你好世界")).toBe("你好世界");
    expect(parseStreamLine("   ")).toBeNull();
    expect(parseStreamLine("whisper_init: ok")).toBeNull();
  });

  it("probeEngine：缺失时逐项 false 并给下载提示；文件齐备时 bin 模式 ok", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-wp-"));
    const mk = (name: string): string => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, "fake");
      return f;
    };
    // 空目录 → 全缺（mode none）
    const miss = probeEngine({
      whisperBin: path.join(dir, "whisper-cli.exe"),
      streamBin: path.join(dir, "whisper-stream.exe"),
      modelPath: path.join(dir, "m.bin"),
      ffmpegBin: path.join(dir, "ffmpeg.exe"),
      pythonExe: path.join(dir, "python.exe"),
    });
    expect(miss.ok).toBe(false);
    expect(miss.mode).toBe("none");
    expect(miss.hints.length).toBeGreaterThanOrEqual(3);
    // 补齐四个文件 → bin 模式 ok
    mk("whisper-cli.exe");
    mk("whisper-stream.exe");
    mk("m.bin");
    mk("ffmpeg.exe");
    const ready = probeEngine({
      whisperBin: path.join(dir, "whisper-cli.exe"),
      streamBin: path.join(dir, "whisper-stream.exe"),
      modelPath: path.join(dir, "m.bin"),
      ffmpegBin: path.join(dir, "ffmpeg.exe"),
      pythonExe: path.join(dir, "python.exe"),
    });
    expect(ready.ok).toBe(true);
    expect(ready.mode).toBe("bin");
    // 只有 Python 后端 → py 模式 ok
    const pyOnly = probeEngine({
      whisperBin: path.join(dir, "no-cli.exe"),
      streamBin: path.join(dir, "no-stream.exe"),
      modelPath: path.join(dir, "no.bin"),
      ffmpegBin: path.join(dir, "no-ffmpeg.exe"),
      pythonExe: path.join(dir, "whisper-cli.exe"), // 复用已创建的假文件当 python.exe
    });
    expect(pyOnly.mode).toBe("py");
    expect(pyOnly.ok).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("写入 whisper-engine 证据产物", () => {
    writeEvidenceLog("whisper-engine.test", ["arg builders; stream line parse; probe with hints"], true);
  });
});
