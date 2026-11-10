// Genesis-1 · 语音转写 CLI（验证引擎与试听用）
// 用法：
//   node node_modules\tsx\dist\cli.mjs scripts\voice.ts probe         查看引擎安装状态与下载指引
//   node node_modules\tsx\dist\cli.mjs scripts\voice.ts file <音频>    转写一个音频文件（群语音等）
//   node node_modules\tsx\dist\cli.mjs scripts\voice.ts listen [设备号] 持续识别（立体声混音/虚拟声卡）
// 亦可：voice.cmd probe | file xxx | listen [n]
import { createWhisperCppEngine } from "../adapters/stt/whisper-engine";
import { deviceSource, fileSource } from "../adapters/stt/voice-source";

const [, , mode, arg] = process.argv;

async function main(): Promise<void> {
  const engine = createWhisperCppEngine();

  if (mode === "probe") {
    const p = engine.probe();
    // eslint-disable-next-line no-console
    console.log(
      `[stt] 后端: ${p.mode}（cloud=云端API / bin=whisper.cpp / py=faster-whisper / none=未安装）` +
        ` | 云端: ${p.cloud ? "OK(key)" : "缺"} | whisper-cli: ${p.whisper ? "OK" : "缺"} | whisper-stream: ${p.stream ? "OK" : "缺"}` +
        ` | 模型: ${p.model ? "OK" : "缺"} | ffmpeg: ${p.ffmpeg ? "OK" : "缺"} | python: ${p.python ? "OK" : "缺"}`,
    );
    for (const h of p.hints) {
      // eslint-disable-next-line no-console
      console.log(`  - ${h}`);
    }
    if (p.ok) {
      // eslint-disable-next-line no-console
      console.log("[stt] 引擎就绪：voice.cmd file <音频> 转写文件；voice.cmd listen 持续识别");
    }
    return;
  }

  if (mode === "file") {
    if (arg === undefined) {
      // eslint-disable-next-line no-console
      console.log("用法：voice.cmd file <音频文件路径>");
      return;
    }
    try {
      const text = await engine.transcribeFile(fileSource(arg));
      // eslint-disable-next-line no-console
      console.log(text === "" ? "（未识别出内容）" : `识别结果：${text}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[stt] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }

  if (mode === "listen") {
    const deviceId = arg !== undefined ? Number(arg) : undefined;
    // eslint-disable-next-line no-console
    console.log(
      deviceId !== undefined
        ? `[stt] 监听捕获设备 #${deviceId}（Ctrl+C 退出）…`
        : "[stt] 监听默认捕获设备（Ctrl+C 退出）；立体声混音设备号可先用 voice.cmd probe 后按提示试…",
    );
    const handle = engine.transcribeStream(deviceSource(deviceId), (u) => {
      // eslint-disable-next-line no-console
      console.log(`听见：${u.text}`);
    });
    if (handle === null) process.exit(1);
    const shutdown = (): void => {
      handle.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    return;
  }

  // eslint-disable-next-line no-console
  console.log("用法：voice.cmd probe | file <音频> | listen [设备号]");
}

void main();
