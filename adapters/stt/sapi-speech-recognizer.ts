// Genesis-1 · STT 语音识别器抽象 + Windows SAPI 实现（值级扩展）
// SAPI：Windows 自带语音识别（DictationGrammar），零安装离线可用，经 PowerShell 子进程识别一句。
// 抽象 SpeechRecognizer 便于日后替换 Whisper / 云 STT。
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface SpeechRecognizer {
  /** 识别一句话（麦克风）；超时/没听清返回空串；环境不支持则 reject */
  recognize(timeoutMs?: number): Promise<string>;
  dispose(): void;
}

export interface SapiSpeechRecognizerOptions {
  /** 识别语言区域，默认 zh-CN（需要系统装有对应语音识别语言包） */
  culture?: string;
  /** 初始静音超时（秒），默认 3 */
  silenceSec?: number;
  /** 持续讲话超时（秒），默认 8 */
  babbleSec?: number;
  /** 句尾静音判定（秒），默认 1.5 */
  endSilenceSec?: number;
}

/** 生成 PowerShell 识别脚本（导出供测试） */
export function buildRecognizeScript(opts?: SapiSpeechRecognizerOptions): string {
  const culture = opts?.culture ?? "zh-CN";
  const silence = opts?.silenceSec ?? 3;
  const babble = opts?.babbleSec ?? 8;
  const endSilence = opts?.endSilenceSec ?? 1.5;
  return (
    `[Console]::OutputEncoding = [Text.Encoding]::UTF8; ` +
    `Add-Type -AssemblyName System.Speech; ` +
    `$c = New-Object System.Globalization.CultureInfo('${culture}'); ` +
    `$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($c); ` +
    `$r.InitialSilenceTimeout = [TimeSpan]::FromSeconds(${silence}); ` +
    `$r.BabbleTimeout = [TimeSpan]::FromSeconds(${babble}); ` +
    `$r.EndSilenceTimeout = [TimeSpan]::FromSeconds(${endSilence}); ` +
    `$r.SetInputToDefaultAudioDevice(); ` +
    `$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar())); ` +
    `$res = $r.Recognize(); if ($res) { Write-Output $res.Text }; $r.Dispose()`
  );
}

export function createSapiSpeechRecognizer(opts?: SapiSpeechRecognizerOptions): SpeechRecognizer {
  let child: ChildProcess | null = null;

  return {
    recognize(timeoutMs = 12_000): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        child = spawn(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", buildRecognizeScript(opts)],
        );
        let out = "";
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child?.kill();
        }, timeoutMs);
        child.stdout?.on("data", (d: Buffer) => {
          out += d.toString("utf8");
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          child = null;
          if (timedOut) {
            resolve(""); // 超时 = 没听清
            return;
          }
          if (code === 0) resolve(out.trim());
          else reject(new Error(`sapi_stt_exit_${code ?? "unknown"}`));
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          child = null;
          reject(err);
        });
      });
    },
    dispose(): void {
      if (child !== null) {
        child.kill();
        child = null;
      }
    },
  };
}
