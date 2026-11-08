// Genesis-1 角色运行时骨架 · 契约（附件 A 3.1）
export const EMOTION_CONTRACT_VERSION = "1.0.0";

export interface EmotionIntent {
  emotion: string;
  variant?: string;
  intensity: number;
  contextTags: string[];
}

export interface VAD {
  valence: number;
  arousal: number;
  dominance: number;
}
