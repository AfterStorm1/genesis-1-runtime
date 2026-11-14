// Genesis-1 · 表演标签工具（值级）：`[少し間]` 这类给 TTS 的表演/呼吸指令
// 用途：① 语音合成时**保留**标签并把它粘在它后面那句台词上；② 文字显示时**剥掉**标签。
// 约定：方括号内 1~60 字、单行，不含换行。嵌套/空标签不识别（当成普通字符）。
const TAG_RE = /\[[^\]\n]{1,60}\]/g;

/** 去掉表演标签，得到给人看的干净文本 */
export function stripVoiceTags(text: string): string {
  return text
    .replace(TAG_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 这段文本里有没有表演标签 */
export function hasVoiceTags(text: string): boolean {
  return new RegExp(TAG_RE.source).test(text);
}

/** 会真正被念出来的字符数（剥掉标签与标点空白/符号）；用于质检门槛 */
export function countSpeakableChars(text: string): number {
  return (text.replace(new RegExp(TAG_RE.source, "g"), "").match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/** 句末是否已经是终止标点（看最后一个非标签字符） */
function endsWithTerminator(segment: string): boolean {
  const bare = segment.replace(new RegExp(TAG_RE.source, "g"), "").trimEnd();
  if (bare === "") return true;
  return /[。！？!?…〜]$/.test(bare);
}

/** 给缺句末标点的一段补「。」；只有标签的段落不补 */
export function ensureVoiceTerminator(segment: string): string {
  return endsWithTerminator(segment) ? segment : `${segment}。`;
}

/**
 * 按句末标点切句（供逐句合成用），规则：
 * 1. 方括号内的内容不参与切分（`[わくわくした早口で]` 不会被切断）
 * 2. 只有标签、没有台词的片段并到**下一句**（结尾剩下的孤立标签丢弃）
 * 3. 每段补句末标点，保证 TTS 有降调
 */
export function splitSpeechSegments(text: string): string[] {
  const raw: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = text.slice(i + 1, close);
        if (inner !== "" && !inner.includes("\n") && inner.length <= 60) {
          buf += text.slice(i, close + 1);
          i = close;
          continue;
        }
      }
    }
    if (ch === "\n" || ch === "。" || ch === "！" || ch === "？" || ch === "!" || ch === "?" || ch === "…") {
      buf += ch;
      // 连续的终止符一起吞掉（「……」不要被切成两段，下一段也就不会以孤零零的「…」开头）
      while (i + 1 < text.length) {
        const next = text[i + 1]!;
        if (next === "。" || next === "！" || next === "？" || next === "!" || next === "?" || next === "…") {
          buf += next;
          i++;
        } else {
          break;
        }
      }
      const seg = buf.trim();
      if (seg !== "") raw.push(seg);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "") raw.push(buf.trim());

  const merged: string[] = [];
  let pending = "";
  for (const seg of raw) {
    const bare = seg.replace(new RegExp(TAG_RE.source, "g"), "").trim();
    if (bare === "" || /^[。！？!?…\s]+$/.test(bare)) {
      pending += seg; // 只有标签（或只有标点）
      continue;
    }
    merged.push(ensureVoiceTerminator(pending + seg));
    pending = "";
  }
  return merged;
}
