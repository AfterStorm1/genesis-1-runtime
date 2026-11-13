// Genesis-1 · 语音引擎（值级）：只用云端克隆音色（SiliconFlow CosyVoice2）。
// 微软 Edge 语音已彻底移除（历史：预设音色人机感强且服务不稳定）。
import { createCloudTts } from "./cloud-tts";

export interface TtsEngine {
  /** 合成语音到本地文件，成功返回路径，失败返回 null；emotion 会映射为语速变化 */
  synthesizeToFile(
    text: string,
    outPath: string,
    opts?: { emotion?: string; speed?: number; gain?: number },
  ): Promise<string | null>;
}

export function createTtsEngine(): TtsEngine {
  const cloud = createCloudTts();
  // TTS_ENGINE=off 可整体关闭语音合成（回复自动落回文字）
  if ((process.env.TTS_ENGINE ?? "cloud") === "off") {
    return {
      async synthesizeToFile() {
        return null;
      },
    };
  }
  return {
    async synthesizeToFile(text, outPath, opts) {
      return cloud.synthesizeToFile(text, outPath, opts);
    },
  };
}
