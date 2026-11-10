// Genesis-1 · 台词后处理（值级，输出侧强制；语言过滤表不进 prompt）
// 功能：
//   1. 语言过滤表：整词移除（“呢”“哦”“啦”“超级”“绝绝子”…）；
//   2. 句尾标点规范化：去掉句号/感叹号/分号结尾，保留问号与省略号（角色规范）；
//   3. 起头词“嗯”连续两次时，第二个换“好”。
import type { SpeechPayload } from "../../core/contract/speech";
import { markSanitized } from "../../core/contract/speech";

/** 默认语言过滤表（角色规范：不进入 prompt，仅在输出侧过滤） */
export const DEFAULT_SPEECH_FILTER: readonly string[] = [
  "呢",
  "哦",
  "啦",
  "超级",
  "绝绝子",
  "爱了",
  "宝",
  "记下了",
  "我说话就这样",
  "不用说了",
];

export interface SpeechPostprocessOptions {
  filter?: readonly string[];
}

/** 文本后处理（导出供测试） */
export function postprocessSpeech(text: string, filter: readonly string[] = DEFAULT_SPEECH_FILTER): string {
  let t = text;
  // 1. 语言过滤表：整词移除（长词先移除，避免破坏短词）
  for (const w of [...filter].sort((a, b) => b.length - a.length)) {
    t = t.split(w).join("");
  }
  // 2. 起头词“嗯”连续两次 → 第二个换“好”
  t = t.replace(/^嗯嗯+/, (m) => "嗯好" + m.slice(2));
  // 3. 句尾标点规范化：句号/感叹号/分号结尾去掉（其后为空白或行尾），问号/省略号保留
  t = t.replace(/[。！；](?=\s|$)/g, "");
  // 4. 清理多余空白
  t = t.replace(/[ \t]{2,}/g, " ").trim();
  return t;
}

/** 对 SpeechPayload 做后处理：返回新的 payload（sanitizedText 重新 brand，保持 L4 只读契约） */
export function postprocessSpeechPayload(payload: SpeechPayload): SpeechPayload {
  const raw = payload.text;
  const cleaned = postprocessSpeech(raw);
  if (cleaned === raw) return payload;
  return {
    ...payload,
    text: cleaned,
    sanitizedText: markSanitized(cleaned),
  };
}
