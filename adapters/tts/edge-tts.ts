// Genesis-1 · 语音引擎选择（值级）：
//   TTS_ENGINE=cloud  SiliconFlow /audio/speech（OpenAI 兼容，克隆音色/内置音色）
//   TTS_ENGINE=fish   Fish Audio（表演指令 + 行内声音标签，走 FISH_* 配置）
//   TTS_ENGINE=off    整体关闭语音合成（回复自动落回文字）
import { createCloudTts } from "./cloud-tts";
import { createFishTts } from "./fish-tts";

export interface TtsEngine {
  /** 合成语音到本地文件，成功返回路径，失败返回 null；emotion 会映射为语速变化 */
  synthesizeToFile(
    text: string,
    outPath: string,
    opts?: { emotion?: string; speed?: number; gain?: number },
  ): Promise<string | null>;
}

export function createTtsEngine(): TtsEngine {
  const which = (process.env.TTS_ENGINE ?? "cloud").trim().toLowerCase();
  if (which === "off") {
    return {
      async synthesizeToFile() {
        return null;
      },
    };
  }
  if (which === "fish") {
    const fish = createFishTts();
    return {
      async synthesizeToFile(text, outPath, opts) {
        return fish.synthesizeToFile(text, outPath, opts);
      },
    };
  }
  const cloud = createCloudTts();
  return {
    async synthesizeToFile(text, outPath, opts) {
      return cloud.synthesizeToFile(text, outPath, opts);
    },
  };
}
