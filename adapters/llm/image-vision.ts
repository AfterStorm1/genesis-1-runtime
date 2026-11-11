// Genesis-1 · 图片识别（值级；OpenAI 兼容视觉模型，默认 SiliconFlow Qwen2.5-VL）
// 环境变量：VISION_BASE_URL / VISION_MODEL / VISION_KEY（默认复用 STT_CLOUD_KEY）
import { resolveCloudConfig } from "../stt/cloud-transcriber";

export interface VisionConfig {
  baseUrl: string;
  model: string;
  key?: string;
}

export function resolveVisionConfig(): VisionConfig {
  const stt = resolveCloudConfig(); // 复用 SiliconFlow 配置（key/baseUrl）
  return {
    baseUrl: (process.env.VISION_BASE_URL ?? stt.baseUrl).replace(/\/+$/, ""),
    model: process.env.VISION_MODEL ?? "Qwen/Qwen2.5-VL-7B-Instruct",
    key: process.env.VISION_KEY ?? stt.key,
  };
}

export interface ImageDescription {
  /** 描述文本；识别失败返回 null */
  describeImage(imageUrl: string): Promise<string | null>;
}

export function createImageDescriber(): ImageDescription {
  const config = resolveVisionConfig();
  return {
    async describeImage(imageUrl: string): Promise<string | null> {
      if (config.key === undefined) {
        // eslint-disable-next-line no-console
        console.warn("[vision] 未配置 VISION_KEY/STT_CLOUD_KEY，跳过图片识别");
        return null;
      }
      try {
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.key}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "用两三句话描述这张图，注意主体、动作、表情和图中文字（如有）。" },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 200,
          }),
        });
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[vision] 识别失败 http_${res.status}`);
          return null;
        }
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        return text !== undefined && text !== "" ? text : null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[vision] 识别异常：${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  };
}
