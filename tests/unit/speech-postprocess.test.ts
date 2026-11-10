// 台词后处理：语言过滤表 / 句尾标点规范化 / 起头词规则（值级扩展测试）
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_FILTER, postprocessSpeech, postprocessSpeechPayload } from "../../adapters/llm/speech-postprocess";
import { isSanitizedText } from "../../core/contract/speech";
import { writeEvidenceLog } from "../helpers/evidence";

describe("speech postprocess", () => {
  it("语言过滤表：整词移除（长词优先，短词不误伤语义核心）", () => {
    expect(postprocessSpeech("坐这吧呢")).toBe("坐这吧");
    expect(postprocessSpeech("我说话就这样，不用说了")).toBe("，");
    expect(postprocessSpeech("好哦好哦啦")).toBe("好好");
  });

  it("句尾标点：句号/感叹号/分号去掉，问号与省略号保留", () => {
    expect(postprocessSpeech("坐这吧。")).toBe("坐这吧");
    expect(postprocessSpeech("你新来的吧？")).toBe("你新来的吧？");
    expect(postprocessSpeech("好……")).toBe("好……");
  });

  it("起头词“嗯”连续两次 → 第二个换“好”", () => {
    expect(postprocessSpeech("嗯嗯，坐吧")).toBe("嗯好，坐吧");
    expect(postprocessSpeech("嗯嗯嗯")).toBe("嗯好嗯");
    expect(postprocessSpeech("好嗯嗯")).toBe("好嗯嗯"); // 非开头不动
  });

  it("postprocessSpeechPayload 重新 brand（L4 只读契约不破）", () => {
    const p = postprocessSpeechPayload({ text: "谢谢。", interruptible: true });
    expect(p.text).toBe("谢谢");
    expect(isSanitizedText(p.sanitizedText)).toBe(true);
    expect(p.sanitizedText?.text).toBe("谢谢");
  });

  it("默认过滤表固定且不为空", () => {
    expect(DEFAULT_SPEECH_FILTER.length).toBeGreaterThan(5);
  });

  it("写入 speech-postprocess 证据产物", () => {
    writeEvidenceLog("speech-postprocess.test", ["filter table; trailing punct; leading en-en; re-brand"], true);
  });
});
