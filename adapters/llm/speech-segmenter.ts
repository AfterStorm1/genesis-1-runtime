// Genesis-1 · 流式切分（值级，可复用）
// 规则来源：实现内固定（原写在世界规则文件的「流式输出适配」一节，规则文件已重置为骨架）
//   - 单句 ≤40 字为原子单元，不拆；短句（“好了”“谢谢”“不清楚”“不能”）整句输出
//   - 问句按问号切（保留问号）；拖尾省略号保留；句号/感叹号/分号由后处理删除
//   - 超长陈述句在语义边界（40 字内最后一个逗号）切分；无逗号则按 40 字硬切
//   - 动作单独成段：待模型输出协议配合（当前按句子逐行输出，规格保留）

export const DEFAULT_SENTENCE_MAX_LEN = 40;

/** 按主要句尾分隔符切开（保留分隔符，句号类留待后处理删除）；纯省略号残段并入前句 */
function hardSplit(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？…；])/u)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const merged: string[] = [];
  for (const p of parts) {
    if (/^…+$/.test(p) && merged.length > 0) {
      merged[merged.length - 1] += p; // “好……”不被拆成“好…”、“…”两条
    } else {
      merged.push(p);
    }
  }
  return merged;
}

/** 把一段回复切分成句子序列（每句 ≤ maxLen，语义边界优先） */
export function segmentSpeech(raw: string, maxLen: number = DEFAULT_SENTENCE_MAX_LEN): string[] {
  const out: string[] = [];

  const walk = (s: string): void => {
    const trimmed = s.trim();
    if (trimmed === "") return;
    if (trimmed.length <= maxLen) {
      out.push(trimmed);
      return;
    }
    // 语义边界：maxLen 以内最后一个逗号
    const head = trimmed.slice(0, maxLen + 1);
    const idx = head.lastIndexOf("，");
    if (idx > 3) {
      walk(trimmed.slice(0, idx + 1));
      walk(trimmed.slice(idx + 1));
      return;
    }
    // 无语义边界 → 硬切
    walk(trimmed.slice(0, maxLen));
    walk(trimmed.slice(maxLen));
  };

  for (const part of hardSplit(raw)) walk(part);
  return out;
}
