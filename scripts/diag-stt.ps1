# STT 诊断脚本：检查语音识别引擎 / 默认麦克风 / 试识别一句
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\diag-stt.ps1
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Write-Host "=== 1. 已安装的识别引擎 ==="
try {
  Add-Type -AssemblyName System.Speech
  [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    ForEach-Object { Write-Host ("  " + $_.Culture.Name + "  " + $_.Description) }
} catch {
  Write-Host ("  加载 System.Speech 失败：" + $_.Exception.Message)
}

Write-Host "=== 2. 默认录音设备 ==="
try {
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine((New-Object System.Globalization.CultureInfo('zh-CN')))
  $r.SetInputToDefaultAudioDevice()
  Write-Host "  OK：默认音频输入可用"
} catch {
  Write-Host ("  失败：" + $_.Exception.Message)
  Write-Host "  排查：控制面板-声音-录制 里选一个默认麦克风；设置-隐私-麦克风 允许桌面应用访问"
  exit 1
}

Write-Host "=== 3. 试识别（请对麦克风说一句话，最多 6 秒）==="
try {
  $r.InitialSilenceTimeout = [TimeSpan]::FromSeconds(2)
  $r.BabbleTimeout = [TimeSpan]::FromSeconds(6)
  $r.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5)
  $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar()))
  $res = $r.Recognize()
  if ($res) { Write-Host ("  识别结果：" + $res.Text) } else { Write-Host "  没听清（超时），麦克风可能有声音但识别不到，检查输入音量" }
} catch {
  Write-Host ("  失败：" + $_.Exception.Message)
  exit 1
}
Write-Host "=== 诊断完成：若第 2、3 步 OK，chat.cmd 里 /说 即可用 ==="
