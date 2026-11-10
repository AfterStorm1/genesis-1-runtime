// STT 识别器：脚本生成（值级扩展测试；真实识别需麦克风，用户终端验证）
import { describe, expect, it } from "vitest";
import { buildRecognizeScript } from "../../adapters/stt/sapi-speech-recognizer";
import { writeEvidenceLog } from "../helpers/evidence";

describe("sapi speech recognizer", () => {
  it("识别脚本包含 UTF8 输出、zh-CN 区域与各超时配置", () => {
    const script = buildRecognizeScript({ silenceSec: 3, babbleSec: 8, endSilenceSec: 1.5 });
    expect(script).toContain("[Console]::OutputEncoding = [Text.Encoding]::UTF8");
    expect(script).toContain("CultureInfo('zh-CN')");
    expect(script).toContain("InitialSilenceTimeout = [TimeSpan]::FromSeconds(3)");
    expect(script).toContain("BabbleTimeout = [TimeSpan]::FromSeconds(8)");
    expect(script).toContain("EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5)");
    expect(script).toContain("DictationGrammar");
    expect(script).toContain("$r.Recognize()"); // 同步识别一句
  });

  it("自定义区域与默认值", () => {
    expect(buildRecognizeScript({ culture: "en-US" })).toContain("CultureInfo('en-US')");
    expect(buildRecognizeScript()).toContain("FromSeconds(3)"); // 默认静音 3s
  });

  it("写入 sapi-recognizer 证据产物", () => {
    writeEvidenceLog("sapi-recognizer.test", ["script shape: utf8/culture/timeouts/dictation"], true);
  });
});
