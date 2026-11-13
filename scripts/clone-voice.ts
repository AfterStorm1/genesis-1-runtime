// 音色克隆脚本：node tsx scripts/clone-voice.ts <音频路径> <音色名> [参考文本]
// 上传 8~30 秒参考音频到 SiliconFlow，返回 uri；结果写入 data/tmp/voice-uri.txt 供后续读取。
// 参考文本缺省时自动读 data/tmp/voice-ref.txt。
import fs from "node:fs";
import path from "node:path";
import { createCloudTts } from "../adapters/tts/cloud-tts";

async function main(): Promise<void> {
  const [filePath, customName, refTextArg] = process.argv.slice(2);
  if (filePath === undefined || customName === undefined) {
    console.log("用法：tsx scripts/clone-voice.ts <音频路径mp3/wav> <音色名> [参考文本]");
    return;
  }
  let refText = refTextArg ?? "";
  if (refText.trim() === "") {
    const refFile = path.join(process.cwd(), "data", "tmp", "voice-ref.txt");
    if (fs.existsSync(refFile)) refText = fs.readFileSync(refFile, "utf8").trim();
  }
  const tts = createCloudTts();
  const uri = await tts.uploadVoice(filePath, customName, refText);
  if (uri !== null) {
    const outFile = path.join(process.cwd(), "data", "tmp", "voice-uri.txt");
    fs.writeFileSync(outFile, uri, "utf8");
    console.log("克隆成功！把下面这行填进 llm-config.cmd：");
    console.log(`set "TTS_CLOUD_VOICE=${uri}"`);
    console.log(`（uri 已写入 ${outFile}）`);
  } else {
    console.log("克隆失败（未实名认证、未配置 key 或接口报错，日志见上方）");
  }
}

void main();
