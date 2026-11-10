// whisper.cpp 引擎：参数构建 / 输出解析 / 安装探测（值级扩展测试；真实转写需用户安装引擎）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  buildWhisperFileArgs,
  buildWhisperStreamArgs,
  parseStreamLine,
  probeEngine,
} from "../../adapters/stt/whisper-engine";
import { writeEvidenceLog } from "../helpers/evidence";

describe("whisper engine (arg building + probe)", () => {
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

  it("probeEngine：缺失时逐项 false 并给下载提示；文件齐备时 ok", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-wp-"));
    const mk = (name: string): string => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, "fake");
      return f;
    };
    // 空目录 → 全缺
    const miss = probeEngine({
      whisperBin: path.join(dir, "whisper-cli.exe"),
      streamBin: path.join(dir, "whisper-stream.exe"),
      modelPath: path.join(dir, "m.bin"),
      ffmpegBin: path.join(dir, "ffmpeg.exe"),
    });
    expect(miss.ok).toBe(false);
    expect(miss.hints.length).toBeGreaterThanOrEqual(3);
    // 补齐四个文件 → ok
    mk("whisper-cli.exe");
    mk("whisper-stream.exe");
    mk("m.bin");
    mk("ffmpeg.exe");
    const ready = probeEngine({
      whisperBin: path.join(dir, "whisper-cli.exe"),
      streamBin: path.join(dir, "whisper-stream.exe"),
      modelPath: path.join(dir, "m.bin"),
      ffmpegBin: path.join(dir, "ffmpeg.exe"),
    });
    expect(ready.ok).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("写入 whisper-engine 证据产物", () => {
    writeEvidenceLog("whisper-engine.test", ["arg builders; stream line parse; probe with hints"], true);
  });
});
