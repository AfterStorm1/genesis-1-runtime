// Genesis-1 · Fish Audio TTS（值级）：表演指令 + 行内声音标签（Drama 模型）
// 为什么单独一个适配器：Fish 的接口不是 OpenAI /audio/speech 形状——模型走请求头 `model`，
// 音色走 `reference_id`，文本里可以带 `[わくわくした早口で]`、`[息を吸う]` 这类“给声优的指令”。
// 端点/字段全部可配（FISH_* 环境变量），因为各家云端字段名偶有变化。
import fs from "node:fs";

export interface FishTtsConfig {
  /** 例：https://api.fish.audio/v1 */
  baseUrl: string;
  /** 例：/tts */
  ttsPath: string;
  /** 例：drama-3 */
  model: string;
  /** 音色 id（Fish Voice Selector 里选的音色） */
  referenceId?: string;
  key?: string;
  /** mp3 / wav / pcm … */
  format: string;
  timeoutMs: number;
  /** 额外请求字段（FISH_REQUEST_EXTRA 传 JSON） */
  extra: Record<string, unknown>;
}

function envNum(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

/** 解析 Fish 配置（导出供测试） */
export function resolveFishConfig(): FishTtsConfig {
  let extra: Record<string, unknown> = {};
  const rawExtra = process.env.FISH_REQUEST_EXTRA;
  if (rawExtra !== undefined && rawExtra.trim() !== "") {
    try {
      const parsed = JSON.parse(rawExtra) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        extra = parsed as Record<string, unknown>;
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[tts:fish] FISH_REQUEST_EXTRA 不是合法 JSON，已忽略");
    }
  }
  const refRaw = process.env.FISH_REFERENCE_ID ?? process.env.FISH_VOICE_ID;
  return {
    baseUrl: (process.env.FISH_BASE_URL ?? "https://api.fish.audio/v1").replace(/\/+$/, ""),
    ttsPath: process.env.FISH_TTS_PATH ?? "/tts",
    model: process.env.FISH_MODEL ?? "drama-3",
    referenceId: refRaw !== undefined && refRaw.trim() !== "" ? refRaw.trim() : undefined,
    key: process.env.FISH_API_KEY ?? process.env.TTS_CLOUD_KEY,
    format: process.env.FISH_FORMAT ?? "mp3",
    timeoutMs: envNum("FISH_TIMEOUT_MS", 30_000),
    extra,
  };
}

/** 响应可能是二进制音频，也可能是带 url / base64 的 JSON（两种都接） */
async function readAudio(res: Response): Promise<Buffer | null> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (ct.startsWith("audio/") || ct === "application/octet-stream") {
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    for (const k of ["audio", "data", "base64", "audio_base64", "audioBase64"]) {
      const v = data[k];
      if (typeof v === "string" && v.length > 1000) {
        return Buffer.from(v.replace(/^data:audio\/[^;]+;base64,/, ""), "base64");
      }
    }
    const url = data["url"];
    if (typeof url === "string" && url.startsWith("http")) {
      const dl = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (dl.ok) return Buffer.from(await dl.arrayBuffer());
    }
  } catch {
    // 不是 JSON：按纯文本处理后返回 null
  }
  return null;
}

export interface FishTts {
  synthesizeToFile(
    text: string,
    outPath: string,
    opts?: { speed?: number; gain?: number; emotion?: string },
  ): Promise<string | null>;
}

export function createFishTts(): FishTts {
  const cfg = resolveFishConfig();
  let warned = false;
  return {
    async synthesizeToFile(text, outPath) {
      if (cfg.key === undefined || cfg.key === "") {
        if (!warned) {
          // eslint-disable-next-line no-console
          console.warn("[tts:fish] 未配置 FISH_API_KEY，跳过语音合成");
          warned = true;
        }
        return null;
      }
      if (cfg.referenceId === undefined) {
        if (!warned) {
          // eslint-disable-next-line no-console
          console.warn("[tts:fish] 未配置 FISH_REFERENCE_ID（音色 id），跳过语音合成");
          warned = true;
        }
        return null;
      }
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${cfg.baseUrl}${cfg.ttsPath}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cfg.key}`,
              model: cfg.model, // Fish 用请求头指定模型
            },
            body: JSON.stringify({
              text,
              reference_id: cfg.referenceId,
              format: cfg.format,
              model: cfg.model, // 有的部署从 body 读，一并带上
              ...cfg.extra,
            }),
            signal: AbortSignal.timeout(cfg.timeoutMs),
          });
          if (res.ok) {
            const buf = await readAudio(res);
            // 空 body / 几百字节的“空气音频”当失败重试（和云端硅基那套经验一致）
            if (buf !== null && buf.length >= 1024) {
              fs.writeFileSync(outPath, buf);
              return outPath;
            }
            // eslint-disable-next-line no-console
            console.warn(`[tts:fish] 响应不可用（${buf?.length ?? 0}B），第 ${attempt} 次`);
          } else {
            const body = await res.text().catch(() => "");
            // eslint-disable-next-line no-console
            console.warn(`[tts:fish] http_${res.status} 第 ${attempt} 次：${body.slice(0, 200)}`);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`[tts:fish] 请求异常 第 ${attempt} 次：${err instanceof Error ? err.message : String(err)}`);
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
      }
      return null;
    },
  };
}
