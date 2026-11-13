// Genesis-1 · 腾讯 silk v3 语音解码（值级；silk-wasm，免编译器）
// QQ 语音文件实为 #!SILK_V3（腾讯私有编码），PyAV/云端 API 均无法直接识别；
// 用 silk-wasm（官方 libSilkCodec 的 WASM 构建）解码成 PCM 再封装 wav。
import fs from "node:fs";

/** 判断是否腾讯 silk v3（#!SILK_V3 魔数）（导出供测试）
 *  注意：QQ 落盘的语音文件常以 0x02 这个字节打头（`02 #!SILK_V3`），
 *  所以不能只看第 0 字节——在头部 10 字节内找魔数（与 NapCat 自己的判断一致）。 */
export function isSilkV3(head: Buffer): boolean {
  return head.subarray(0, 10).toString("latin1").includes("#!SILK_V3");
}

/** 读文件头判断是否 silk（导出供测试） */
export function isSilkFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    return isSilkV3(head);
  } catch {
    return false;
  }
}

/** PCM(int16) 封装为 wav 文件（44 字节标准头）（导出供测试） */
export function writePcmWav(outPath: string, pcm: Int16Array, sampleRate: number): void {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM 头大小
  header.writeUInt16LE(1, 20); // 音频格式 1 = PCM
  header.writeUInt16LE(1, 22); // 单声道
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // 字节率 = 采样率 × 1 声道 × 2 字节
  header.writeUInt16LE(2, 32); // 块对齐
  header.writeUInt16LE(16, 34); // 位深
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(outPath, Buffer.concat([header, data]));
}

interface SilkWasmDecodeResult {
  /** pcm_s16le */
  data: Uint8Array | Int16Array;
  /** 毫秒 */
  duration: number;
}

interface SilkWasmModule {
  decode(buffer: Uint8Array, sampleRate: number): Promise<SilkWasmDecodeResult | Int16Array>;
}

/** 把 silk-wasm 的解码结果统一成 Int16Array（3.x 返回 {data,duration}，老版本直接返回 PCM） */
function toPcm(res: SilkWasmDecodeResult | Int16Array): Int16Array {
  if (res instanceof Int16Array) return res;
  const raw = res.data;
  if (raw instanceof Int16Array) return raw;
  // Uint8Array → 复制到 2 字节对齐的新 buffer 再当 PCM 用
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return new Int16Array(copy.buffer, 0, copy.byteLength >> 1);
}

/** silk v3 → wav（24k 采样率与 QQ 语音一致；云端 API 接受 24k wav） */
export async function decodeSilkToWav(inputPath: string, outPath: string, sampleRate = 24_000): Promise<string> {
  const silk = (await import("silk-wasm")) as SilkWasmModule;
  const buf = fs.readFileSync(inputPath);
  const pcm = toPcm(await silk.decode(buf, sampleRate));
  writePcmWav(outPath, pcm, sampleRate);
  return outPath;
}
