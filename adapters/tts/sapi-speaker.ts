// Genesis-1 · TTS 扬声器抽象 + Windows SAPI 实现（值级扩展）
// SAPI：Windows 自带语音（中文 Huihui），零安装离线可用；经 PowerShell 子进程朗读。
// 抽象 Speaker 便于日后替换 edge-tts / piper / 云 TTS。
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface Speaker {
  /** 朗读整段文本；正常读完 resolve，失败 reject */
  speak(text: string): Promise<void>;
  /** 立即停止当前朗读（打断用） */
  stop(): void;
}

export interface SapiSpeakerOptions {
  /** 语速 -10（慢）~ 10（快），默认 0 */
  rate?: number;
}

/** Windows SAPI 扬声器（PowerShell + System.Speech，同步朗读子进程） */
export function createSapiSpeaker(opts?: SapiSpeakerOptions): Speaker {
  const rate = Math.min(10, Math.max(-10, opts?.rate ?? 0));
  let child: ChildProcess | null = null;

  return {
    speak(text: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        // 文本经 Base64 传入，规避引号/编码转义问题
        const b64 = Buffer.from(text, "utf8").toString("base64");
        const ps =
          `Add-Type -AssemblyName System.Speech; ` +
          `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
          `$s.Rate = ${rate}; ` +
          `$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')); ` +
          `$s.Speak($t); $s.Dispose()`;
        child = spawn(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
          { stdio: ["ignore", "ignore", "ignore"] },
        );
        child.on("exit", (code) => {
          child = null;
          if (code === 0) resolve();
          else reject(new Error(`sapi_exit_${code ?? "unknown"}`));
        });
        child.on("error", (err) => {
          child = null;
          reject(err);
        });
      });
    },
    stop(): void {
      if (child !== null) {
        child.kill();
        child = null;
      }
    },
  };
}
