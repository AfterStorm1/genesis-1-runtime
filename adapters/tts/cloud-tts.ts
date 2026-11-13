// Genesis-1 · 云端 TTS（值级；OpenAI 兼容 /audio/speech，默认 SiliconFlow CosyVoice2）
// 自定义声音：把 8~10 秒参考音频上传克隆（/uploads/audio/voice → uri），
// 把返回的 uri 填进 TTS_CLOUD_VOICE 即可使用克隆音色。
import fs from "node:fs";
import { resolveCloudConfig } from "../stt/cloud-transcriber";

export interface CloudTtsConfig {
  baseUrl: string;
  model: string;
  voice: string;
  /** 语速 0.25~4.0（默认 0.95，略慢显温柔） */
  speed: number;
  /** 增益 dB -10~10（默认 0） */
  gain: number;
  key?: string;
}

export function resolveTtsConfig(): CloudTtsConfig {
  const stt = resolveCloudConfig(); // 复用 SiliconFlow key/baseUrl
  return {
    baseUrl: (process.env.TTS_CLOUD_BASE_URL ?? stt.baseUrl).replace(/\/+$/, ""),
    model: process.env.TTS_CLOUD_MODEL ?? "FunAudioLLM/CosyVoice2-0.5B",
    voice: process.env.TTS_CLOUD_VOICE ?? "FunAudioLLM/CosyVoice2-0.5B:claire",
    speed: Number(process.env.TTS_CLOUD_SPEED ?? 0.9) || 0.9,
    gain: Number(process.env.TTS_CLOUD_GAIN ?? 0) || 0,
    key: process.env.TTS_CLOUD_KEY ?? stt.key,
  };
}

/** 情绪状态 → TTS 语气指令（导出供测试）：语音跟着她的心情走 */
export function emotionHint(emotion: string): string | undefined {
  switch (emotion) {
    case "happy":
      return "用轻快一点的语气说";
    case "sad":
      return "用轻柔低沉的语气说";
    case "angry":
      return "用克制但认真的语气说";
    case "calm":
      return "用平静而克制的语气说";
    default:
      return undefined;
  }
}

export interface CloudTts {
  /** 合成语音到本地文件，成功返回路径，失败返回 null；emotion 会映射为语速变化 */
  synthesizeToFile(
    text: string,
    outPath: string,
    opts?: { speed?: number; gain?: number; emotionHint?: string; emotion?: string },
  ): Promise<string | null>;
  /** 上传参考音频克隆音色，成功返回 uri */
  uploadVoice(filePath: string, customName: string, refText: string): Promise<string | null>;
}

/** 情绪 → 云端语速（情绪指令会被念出来，改用速度表达情感；克隆音色对变速敏感，幅度收敛）（导出供测试） */
export function emotionSpeed(emotion: string): number | undefined {
  switch (emotion) {
    case "happy":
      return 1.0; // 轻快一点
    case "sad":
      return 0.85; // 放缓
    case "angry":
      return 1.0;
    case "calm":
      return 0.95; // 平静略慢（避免小幅度变速引起电音）
    default:
      return undefined;
  }
}

export function createCloudTts(): CloudTts {
  const config = resolveTtsConfig();
  return {
    async synthesizeToFile(
      text: string,
      outPath: string,
      opts?: { speed?: number; gain?: number; emotionHint?: string; emotion?: string },
    ): Promise<string | null> {
      if (config.key === undefined) {
        // eslint-disable-next-line no-console
        console.warn("[tts] 未配置 TTS_CLOUD_KEY/STT_CLOUD_KEY，跳过语音合成");
        return null;
      }
      try {
        // 注意：情绪指令前缀在部分模型上会被当成正文念出来——云端路径不再加指令，只合成纯文本
        const input = text;
        let lastBody = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await fetch(`${config.baseUrl}/audio/speech`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify({
              model: config.model,
              voice: config.voice,
              input,
              response_format: "mp3",
              speed: opts?.speed ?? (opts?.emotion !== undefined ? emotionSpeed(opts.emotion) : undefined) ?? config.speed,
              gain: opts?.gain ?? config.gain,
            }),
          });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            // 200 + 空 body / 几百字节的“空气mp3”是这个接口常见的坏响应：
            // 写下去就是 0 字节或纯静音文件，后面会在质检里被判死，不如直接重试
            if (buf.length < 1024) {
              lastBody = `empty body (${buf.length}B)`;
              if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
              continue;
            }
            fs.writeFileSync(outPath, buf);
            return outPath;
          }
          lastBody = await res.text().catch(() => "");
          if (attempt < 3) {
            // 50507 类瞬时错误：稍等重试
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        // eslint-disable-next-line no-console
        console.warn(`[tts] 合成失败（重试用尽）：${lastBody.slice(0, 200)}`);
        return null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[tts] 合成异常：${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    async uploadVoice(filePath: string, customName: string, refText: string): Promise<string | null> {
      if (config.key === undefined) {
        // eslint-disable-next-line no-console
        console.warn("[tts] 未配置 key（TTS_CLOUD_KEY/STT_CLOUD_KEY），无法克隆");
        return null;
      }
      if (!fs.existsSync(filePath)) {
        // eslint-disable-next-line no-console
        console.warn(`[tts] 音频文件不存在：${filePath}`);
        return null;
      }
      try {
        const form = new FormData();
        form.append("model", config.model);
        form.append("customName", customName);
        form.append("text", refText);
        form.append("file", new Blob([fs.readFileSync(filePath)]), filePath.split(/[\\/]/).pop() ?? "ref.mp3");
        const res = await fetch(`${config.baseUrl}/uploads/audio/voice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.key}` },
          body: form,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // eslint-disable-next-line no-console
          console.warn(`[tts] 音色克隆失败 http_${res.status}: ${body.slice(0, 300)}`);
          return null;
        }
        const data = (await res.json()) as { uri?: string };
        return data.uri ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[tts] 音色克隆异常：${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  };
}
