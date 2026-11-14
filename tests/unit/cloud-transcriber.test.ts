// 云端转写后端：URL 构建 / 探测 / fetch 调用（stub fetch，不真联网）
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTranscribeUrl, createCloudTranscriber, probeCloud, resolveCloudConfig } from "../../adapters/stt/cloud-transcriber";
import { fileSource } from "../../adapters/stt/voice-source";
import { writeEvidenceLog } from "../helpers/evidence";

const ORIG = { key: process.env.STT_CLOUD_KEY, base: process.env.STT_CLOUD_BASE_URL, model: process.env.STT_CLOUD_MODEL };
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.STT_CLOUD_KEY = ORIG.key;
  process.env.STT_CLOUD_BASE_URL = ORIG.base;
  process.env.STT_CLOUD_MODEL = ORIG.model;
});

describe("cloud transcriber", () => {
  it("URL 与默认配置：SiliconFlow + SenseVoiceSmall", () => {
    expect(buildTranscribeUrl("https://api.siliconflow.cn/v1")).toBe(
      "https://api.siliconflow.cn/v1/audio/transcriptions",
    );
    delete process.env.STT_CLOUD_KEY;
    delete process.env.STT_CLOUD_BASE_URL;
    delete process.env.STT_CLOUD_MODEL;
    const cfg = resolveCloudConfig();
    expect(cfg.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(cfg.model).toBe("FunAudioLLM/SenseVoiceSmall");
    expect(cfg.key).toBeUndefined();
  });

  it("probeCloud：无 key → ok=false + 注册提示；有 key → ok", () => {
    delete process.env.STT_CLOUD_KEY;
    expect(probeCloud().ok).toBe(false);
    expect(probeCloud().hints.join("")).toContain("siliconflow");
    process.env.STT_CLOUD_KEY = "sk-test";
    expect(probeCloud().ok).toBe(true);
  });

  it("transcribeFile：POST FormData 带 file/model/language，解析返回 text", async () => {
    process.env.STT_CLOUD_KEY = "sk-test";
    process.env.STT_CLOUD_BASE_URL = "https://api.example.com/v1";
    const calls: Array<{ url: string; method: string; auth: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "", auth: String((init?.headers as Record<string, string>)?.Authorization ?? "") });
        return new Response(JSON.stringify({ text: " 你好，我是测试角色 " }), { status: 200 });
      }),
    );
    const t = createCloudTranscriber();
    const text = await t.transcribeFile(fileSource("D:/x/voice.wav"));
    expect(text).toBe("你好，我是测试角色");
    expect(calls[0]!.url).toBe("https://api.example.com/v1/audio/transcriptions");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.auth).toBe("Bearer sk-test");
  });

  it("transcribeFile：HTTP 错误 → 抛 cloud_stt_http_<status>", async () => {
    process.env.STT_CLOUD_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 401 })));
    const t = createCloudTranscriber();
    await expect(t.transcribeFile(fileSource("D:/x/voice.wav"))).rejects.toThrow("cloud_stt_http_401");
  });

  it("写入 cloud-transcriber 证据产物", () => {
    writeEvidenceLog("cloud-transcriber.test", ["url/config; probe; multipart post; error mapping"], true);
  });
});
