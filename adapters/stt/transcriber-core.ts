// Genesis-1 · 转写核心抽象（值级）
// 唯一引擎 = whisper.cpp（文件模式 whisper-cli / 流模式 whisper-stream）；
// 下游统一产出 Utterance，供任何宿主送入 sendUserMessage。
import type { VoiceSource } from "./voice-source";

export interface Utterance {
  text: string;
  ts: number;
  sourceLabel?: string;
}

export interface StreamHandle {
  stop(): void;
}

export interface EngineProbe {
  /** 某后端就绪 */
  ok: boolean;
  /** 当前生效后端：bin（whisper.cpp 二进制）/ py（faster-whisper Python）/ none */
  mode: "bin" | "py" | "none";
  /** 文件转写（whisper-cli.exe）可用 */
  whisper: boolean;
  /** 流式转写（whisper-stream.exe）可用 */
  stream: boolean;
  /** 模型文件存在 */
  model: boolean;
  /** ffmpeg 可用（文件转写转码用） */
  ffmpeg: boolean;
  /** Python 后端解释器存在 */
  python: boolean;
  /** 缺失组件的下载提示 */
  hints: string[];
}

export interface TranscriberCore {
  /** 引擎安装状态（未装时各项 false + 下载提示） */
  probe(): EngineProbe;
  /** 文件转写（群语音文件等）；引擎缺失时 reject 并带下载提示 */
  transcribeFile(source: VoiceSource): Promise<string>;
  /** 持续流式转写（直播/连麦/游戏频道/VRChat 等）；引擎不可用返回 null */
  transcribeStream(source: VoiceSource, onUtterance: (u: Utterance) => void): StreamHandle | null;
}
