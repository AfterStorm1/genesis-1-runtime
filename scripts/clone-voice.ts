// 音色克隆脚本：node tsx scripts/clone-voice.ts <音频路径> <音色名> <参考文本>
// 上传 8~10 秒参考音频到 SiliconFlow，返回 uri —— 把 uri 填进 llm-config.cmd 的 TTS_CLOUD_VOICE 即用。
import { createCloudTts } from "../adapters/tts/cloud-tts";

async function main(): Promise<void> {
  const [filePath, customName, refText] = process.argv.slice(2);
  if (filePath === undefined || customName === undefined) {
    console.log("用法：tsx scripts/clone-voice.ts <音频路径mp3/wav> <音色名> <参考文本>");
    return;
  }
  const tts = createCloudTts();
  const uri = await tts.uploadVoice(filePath, customName, refText ?? "");
  if (uri !== null) {
    console.log("克隆成功！把下面这行填进 llm-config.cmd：");
    console.log(`set "TTS_CLOUD_VOICE=${uri}"`);
  } else {
    console.log("克隆失败（未配置 key 或接口报错，日志见上方）");
  }
}

void main();
