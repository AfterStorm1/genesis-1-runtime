// silk 解码：魔数判定 + PCM→wav 封装（silk-wasm 真解码需装包，在用户环境运行）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSilkV3, writePcmWav } from "../../adapters/stt/silk-decode";
import { writeEvidenceLog } from "../helpers/evidence";

describe("silk decode helpers", () => {
  it("isSilkV3：识别 #!SILK_V3 魔数", () => {
    expect(isSilkV3(Buffer.from("#!SILK_V3\x12\x00abc"))).toBe(true);
    expect(isSilkV3(Buffer.from("#!SILK_V2\x12\x00abc"))).toBe(false);
    expect(isSilkV3(Buffer.from("RIFF....WAVE"))).toBe(false);
    expect(isSilkV3(Buffer.from("short"))).toBe(false);
  });

  it("writePcmWav：标准 44 字节头 + PCM 数据，长度正确", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-wav-"));
    const out = path.join(dir, "t.wav");
    const pcm = new Int16Array([0, 1000, -1000, 2000]);
    writePcmWav(out, pcm, 24000);
    const buf = fs.readFileSync(out);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(buf.readUInt32LE(4)).toBe(36 + pcm.byteLength);
    expect(buf.readUInt32LE(24)).toBe(24000);
    expect(buf.readUInt16LE(22)).toBe(1); // 单声道
    expect(buf.length).toBe(44 + pcm.byteLength);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("写入 silk-decode 证据产物", () => {
    writeEvidenceLog("silk-decode.test", ["magic detect; pcm->wav header"], true);
  });
});
