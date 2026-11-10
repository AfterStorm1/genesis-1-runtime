// Genesis-1 · 音频源抽象（值级）
// 所有语音场景归一化为三类来源；新增场景 = 新增一个 Source，转写引擎与角色链路永不改动。
export type VoiceSourceKind = "file" | "device" | "network";

export interface VoiceSource {
  kind: VoiceSourceKind;
  label: string;
  /** 文件型：本地音频路径（群语音文件等） */
  filePath?: string;
  /** 设备型：捕获设备编号（whisper-stream 的 -c 参数；立体声混音/虚拟声卡即此路径） */
  deviceId?: number;
}

export function fileSource(filePath: string, label?: string): VoiceSource {
  return { kind: "file", label: label ?? filePath, filePath };
}

export function deviceSource(deviceId: number | undefined, label?: string): VoiceSource {
  return { kind: "device", label: label ?? `capture#${deviceId ?? "default"}`, deviceId };
}
