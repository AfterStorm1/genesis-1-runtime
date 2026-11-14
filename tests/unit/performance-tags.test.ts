// 表演标签管线：切句/剥标签/可念字数（纯函数，值级）
import { describe, expect, it } from "vitest";
import {
  countSpeakableChars,
  ensureVoiceTerminator,
  hasVoiceTags,
  splitSpeechSegments,
  stripVoiceTags,
} from "../../adapters/llm/performance-tags";

describe("performance tags", () => {
  it("stripVoiceTags：给人看的文本里没有方括号标签", () => {
    const s = "[少し眠そうに] ん……[あくび] あと五分。";
    expect(stripVoiceTags(s)).toBe("ん…… あと五分。");
    expect(hasVoiceTags(s)).toBe(true);
    expect(hasVoiceTags("タグなし")).toBe(false);
  });

  it("countSpeakableChars：标签不算字，标点空白不算字", () => {
    expect(countSpeakableChars("[息を吸う] ねえ、聞いて。")).toBe(5);
    expect(countSpeakableChars("タグなしの文")).toBe(6);
  });

  it("标签粘在它后面那句台词上，不会被切成独立句子", () => {
    const segs = splitSpeechSegments("[わくわくした早口で] ねえねえ、聞いて！[息を吸う] あのね。");
    expect(segs).toEqual(["[わくわくした早口で] ねえねえ、聞いて！", "[息を吸う] あのね。"]);
  });

  it("省略号不被切断，不会让下一段以孤零零的「…」开头", () => {
    const segs = splitSpeechSegments("[眠そうに] ん……[あくび] もうちょっとだけ……");
    expect(segs).toEqual(["[眠そうに] ん……", "[あくび] もうちょっとだけ……"]);
  });

  it("缺句末标点的段落补「。」；只有标签的段落并到下一段", () => {
    expect(ensureVoiceTerminator("ねえ")).toBe("ねえ。");
    expect(ensureVoiceTerminator("ねえ！")).toBe("ねえ！");
    expect(ensureVoiceTerminator("[間]")).toBe("[間]");
    expect(splitSpeechSegments("[間] ねえ")).toEqual(["[間] ねえ。"]);
  });

  it("没有标签的普通中文照样按句切分", () => {
    expect(splitSpeechSegments("今天天气不错。你去哪了？")).toEqual(["今天天气不错。", "你去哪了？"]);
  });
});
