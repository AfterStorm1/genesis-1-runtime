// Genesis-1 · 云端语音转写后端（TranscriberCore 实现，值级）
// OpenAI 兼容 /v1/audio/transcriptions 协议：适配 SiliconFlow（国内直连）/ OpenAI 等。
// 环境变量：STT_CLOUD_KEY（必填）、STT_CLOUD_BASE_URL（默认 https://api.siliconflow.cn/v1）、
//           STT_CLOUD_MODEL（默认 FunAudioLLM/SenseVoiceSmall，中文质量好且便宜）。
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { EngineProbe, StreamHandle, TranscriberCore, Utterance } from "./transcriber-core";
import type { VoiceSource } from "./voice-source";

export interface CloudSttOptions {
  key?: string;
  baseUrl?: string;
  model?: string;
}

export function resolveCloudConfig(opts?: CloudSttOptions): { key?: string; baseUrl: string; model: string } {
  const key = opts?.key ?? process.env.STT_CLOUD_KEY ?? process.env.STT_API_KEY;
  return {
    key: key !== undefined && key !== "" ? key : undefined,
    baseUrl: (opts?.baseUrl ?? process.env.STT_CLOUD_BASE_URL ?? "https://api.siliconflow.cn/v1").replace(/\/+$/, ""),
    model: opts?.model ?? process.env.STT_CLOUD_MODEL ?? "FunAudioLLM/SenseVoiceSmall",
  };
}

/** 转写请求地址（导出供测试） */
export function buildTranscribeUrl(baseUrl: string): string {
  return `${baseUrl}/audio/transcriptions`;
}

/** 云端探测（导出供测试） */
export function probeCloud(opts?: CloudSttOptions): Pick<EngineProbe, "ok" | "mode" | "hints"> & { cloud: boolean } {
  const cfg = resolveCloudConfig(opts);
  const ok = cfg.key !== undefined;
  return {
    ok,
    mode: "cloud",
    cloud: ok,
    hints: ok
      ? []
      : ["云端转写需设置 STT_CLOUD_KEY（推荐硅基流动：https://siliconflow.cn 注册拿 key，模型 SenseVoiceSmall）"],
  };
}

export interface CloudTranscriber extends TranscriberCore {
  readonly config: ReturnType<typeof resolveCloudConfig>;
}

export function createCloudTranscriber(opts?: CloudSttOptions): CloudTranscriber {
  const config = resolveCloudConfig(opts);

  async function postFile(source: VoiceSource): Promise<string> {
    if (config.key === undefined) {
      throw new Error("云端转写未配置：设置 STT_CLOUD_KEY（推荐 https://siliconflow.cn 注册）");
    }
    if (source.filePath === undefined) {
      throw new Error("云端转写需要 file 型音频源");
    }
    const fileData = await readFile(source.filePath);
    const form = new FormData();
    form.append(
      "file",
      new Blob([fileData], { type: "audio/wav" }),
      path.basename(source.filePath),
    );
    form.append("model", config.model);
    form.append("language", "zh");
    const res = await fetch(buildTranscribeUrl(config.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`cloud_stt_http_${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  }

  return {
    config,
    probe: () => ({ ...probeCloud(opts), whisper: false, stream: false, model: false, ffmpeg: false, python: false }),
    async transcribeFile(source: VoiceSource): Promise<string> {
      return postFile(source);
    },
    transcribeStream(_source: VoiceSource, _onUtterance: (u: Utterance) => void): StreamHandle | null {
      // eslint-disable-next-line no-console
      console.warn("[stt] 云端后端暂不支持实时流：文件转写走云端，持续识别请用本地后端（voice.cmd listen）");
      return null;
    },
  };
}
