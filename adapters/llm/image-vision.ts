// Genesis-1 · 图片识别（值级；OpenAI 兼容视觉模型，默认 SiliconFlow Qwen2.5-VL）
// 环境变量：VISION_BASE_URL / VISION_MODEL / VISION_KEY（默认复用 STT_CLOUD_KEY）
import fs from "node:fs";
import { resolveCloudConfig } from "../stt/cloud-transcriber";

export interface VisionConfig {
  baseUrl: string;
  model: string;
  key?: string;
}

export interface VisionImageInput {
  /** 图片 url（QQ CDN，可能被拒） */
  url?: string;
  /** 本地文件路径（NapCat 缓存，优先使用） */
  localPath?: string;
}

export function resolveVisionConfig(): VisionConfig {
  const stt = resolveCloudConfig(); // 复用 SiliconFlow 配置（key/baseUrl）
  return {
    baseUrl: (process.env.VISION_BASE_URL ?? stt.baseUrl).replace(/\/+$/, ""),
    model: process.env.VISION_MODEL ?? "",
    key: process.env.VISION_KEY ?? stt.key,
  };
}

/** 候选视觉模型（平台模型名会随版本调整：按序尝试，首个可用即用） */
export const DEFAULT_VISION_MODELS: readonly string[] = [
  "Qwen/Qwen3-VL-32B-Instruct",
  "Qwen/Qwen2.5-VL-72B-Instruct",
  "Qwen/Qwen2.5-VL-32B-Instruct",
  "Qwen/Qwen2-VL-7B-Instruct",
  "deepseek-ai/deepseek-vl2",
];

export interface ImageDescription {
  /** 描述图片；识别失败返回 null */
  describeImage(input: VisionImageInput): Promise<string | null>;
}

function mimeOf(name: string): string {
  if (name.includes(".png")) return "image/png";
  if (name.includes(".gif")) return "image/gif";
  if (name.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

export function createImageDescriber(): ImageDescription {
  const config = resolveVisionConfig();

  /** 优先本地文件；否则下载 url（带浏览器头）→ base64 直传 */
  async function toDataUri(input: VisionImageInput): Promise<string> {
    if (input.localPath !== undefined && fs.existsSync(input.localPath)) {
      const buf = fs.readFileSync(input.localPath);
      return `data:${mimeOf(input.localPath)};base64,${buf.toString("base64")}`;
    }
    if (input.url === undefined) throw new Error("no_image_source");
    const res = await fetch(input.url, {
      headers: {
        // QQ 资源服务器要求浏览器特征，否则 400
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://qq.com/",
      },
    });
    if (!res.ok) throw new Error(`image_download_http_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mimeOf(input.url)};base64,${buf.toString("base64")}`;
  }

  return {
    async describeImage(input: VisionImageInput): Promise<string | null> {
      if (config.key === undefined) {
        // eslint-disable-next-line no-console
        console.warn("[vision] 未配置 VISION_KEY/STT_CLOUD_KEY，跳过图片识别");
        return null;
      }
      try {
        const dataUri = await toDataUri(input);
        // 多模型按序尝试：平台模型名会调整，首个可用的即用
        const models = config.model !== "" ? [config.model] : [...DEFAULT_VISION_MODELS];
        let lastError = "";
        for (const model of models) {
          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "用两三句话描述这张图，注意主体、动作、表情和图中文字（如有）。" },
                    { type: "image_url", image_url: { url: dataUri } },
                  ],
                },
              ],
              max_tokens: 200,
            }),
          });
          if (!res.ok) {
            lastError = await res.text().catch(() => "");
            // eslint-disable-next-line no-console
            console.warn(`[vision] 模型 ${model} 失败 http_${res.status}: ${lastError.slice(0, 120)}`);
            continue; // 换下一个候选模型
          }
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text !== undefined && text !== "") {
            return text;
          }
          return null;
        }
        // eslint-disable-next-line no-console
        console.warn(`[vision] 全部候选模型均失败：${lastError.slice(0, 200)}`);
        return null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[vision] 识别异常：${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  };
}
