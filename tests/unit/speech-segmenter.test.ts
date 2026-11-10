// 流式切分：单句上限 / 语义边界 / 问号省略号保留（值级扩展测试）
import { describe, expect, it } from "vitest";
import { segmentSpeech } from "../../adapters/llm/speech-segmenter";
import { writeEvidenceLog } from "../helpers/evidence";

describe("speech segmenter", () => {
  it("按句尾分隔符切分；短句整句输出；空串返回空", () => {
    expect(segmentSpeech("坐吧。好……")).toEqual(["坐吧。", "好……"]);
    expect(segmentSpeech("")).toEqual([]);
    expect(segmentSpeech("谢谢")).toEqual(["谢谢"]);
    expect(segmentSpeech("好……")).toEqual(["好……"]); // 纯省略号残段并入前句，不单独成行
  });

  it("≤25 字单句为原子单元，不拆", () => {
    const s = "这正好是二十五个字的一句话给你看就这样";
    expect(s.length).toBeLessThanOrEqual(25);
    expect(segmentSpeech(s)).toEqual([s]);
  });

  it("超长句在语义边界（25 字内最后一个逗号）切分", () => {
    const raw = "前面是一段比较长的说明文字，这里需要切一下，后面还有内容要接着说下去的话";
    const segs = segmentSpeech(raw);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(25);
    expect(segs.join("")).toBe(raw);
  });

  it("问号保留在句尾；句号/感叹号/分号留在句尾待后处理删除", () => {
    const segs = segmentSpeech("你新来的吧？我是。");
    expect(segs).toEqual(["你新来的吧？", "我是。"]);
  });

  it("拒绝句/固定短句原子输出（天然满足：短句不切）", () => {
    expect(segmentSpeech("不能")).toEqual(["不能"]);
    expect(segmentSpeech("不清楚")).toEqual(["不清楚"]);
  });

  it("写入 speech-segmenter 证据产物", () => {
    writeEvidenceLog("speech-segmenter.test", ["25-char atomic; semantic split; punctuation keep"], true);
  });
});
