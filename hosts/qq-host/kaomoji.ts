// Genesis-1 · 颜文字发射（值级；QQ 群宿主用）
// 心情好（happy 且强度达标）+ 过了冷却 → 句尾随机跟一个颜文字；
// 由宿主控制，不靠 LLM 自觉，保证「偶尔、应景、不滥用」。
export interface KaomojiConfig {
  enabled: boolean;
  /** 情绪强度阈值（默认 0.55） */
  minIntensity: number;
  /** 每群冷却（默认 5 分钟） */
  cooldownMs: number;
}

export const HAPPY_KAOMOJI: readonly string[] = [
  "(｡•̀ᴗ-)✧",
  "^_^",
  "(=^･ω･^=)",
  "ヽ(✿ﾟ▽ﾟ)ノ",
  "(๑•̀ㅂ•́)و✧",
  "( ˶ˆ ᗜ ˆ˵ )",
];

/** 决定是否发射颜文字（导出供测试）；rng 可注入（测试用） */
export function pickKaomoji(
  state: { emotion: string; intensity: number } | undefined,
  lastAt: number,
  now: number,
  cfg: KaomojiConfig,
  rng: () => number = Math.random,
): string | null {
  if (!cfg.enabled || state === undefined) return null;
  if (state.emotion !== "happy" || state.intensity < cfg.minIntensity) return null;
  if (now - lastAt < cfg.cooldownMs) return null;
  const idx = Math.floor(rng() * HAPPY_KAOMOJI.length);
  return HAPPY_KAOMOJI[idx] ?? null;
}
