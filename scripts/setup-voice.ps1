# Genesis-1 语音转写引擎一键安装（whisper.cpp + 中文模型 + ffmpeg）
# 用法：双击 setup-voice.cmd（或 powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-voice.ps1）
# 产物：tools\whisper\{whisper-cli.exe, whisper-stream.exe, ggml-base.bin} + tools\ffmpeg\ffmpeg.exe
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ProgressPreference = "SilentlyContinue"

$Root = Split-Path -Parent $PSScriptRoot   # runtime\
$WhisperDir = Join-Path $Root "tools\whisper"
$FfmpegDir = Join-Path $Root "tools\ffmpeg"
$Tmp = Join-Path $env:TEMP ("genesis-voice-setup-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $WhisperDir, $FfmpegDir, $Tmp | Out-Null

function Download-File([string]$Url, [string]$Out, [string[]]$Fallbacks) {
  $urls = @($Url) + $Fallbacks
  foreach ($u in $urls) {
    try {
      Write-Host ("  下载 " + $u)
      Invoke-WebRequest -Uri $u -OutFile $Out -TimeoutSec 900
      if ((Get-Item $Out).Length -gt 1024) { Write-Host ("    完成 " + [math]::Round((Get-Item $Out).Length/1MB, 1) + " MB"); return }
    } catch {
      Write-Host ("    失败（" + $_.Exception.Message + "），尝试备用地址…")
    }
  }
  throw "下载失败：" + $Url
}

# 1. whisper.cpp 预编译包（含 whisper-cli.exe / whisper-stream.exe），v1.7.5
$WZip = Join-Path $Tmp "whisper.zip"
Write-Host "== 1/3 whisper.cpp =="
Download-File "https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip" $WZip @(
  "https://mirror.ghproxy.com/https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip"
)
Expand-Archive -Path $WZip -DestinationPath (Join-Path $Tmp "whisper") -Force
$cli = Get-ChildItem -Path (Join-Path $Tmp "whisper") -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
$stm = Get-ChildItem -Path (Join-Path $Tmp "whisper") -Recurse -Filter "whisper-stream.exe" | Select-Object -First 1
if ($null -eq $cli -or $null -eq $stm) { throw "whisper.cpp 包内未找到 whisper-cli.exe / whisper-stream.exe" }
Copy-Item $cli.FullName (Join-Path $WhisperDir "whisper-cli.exe") -Force
Copy-Item $stm.FullName (Join-Path $WhisperDir "whisper-stream.exe") -Force
Write-Host "  whisper-cli / whisper-stream 就位"

# 2. 中文模型（默认 ggml-base.bin 约 140MB；想要更准可在 env 设 WHISPER_MODEL_SIZE=small）
$Size = if ($env:WHISPER_MODEL_SIZE -eq "small") { "small" } else { "base" }
$Model = Join-Path $WhisperDir ("ggml-" + $Size + ".bin")
Write-Host ("== 2/3 模型 ggml-" + $Size + ".bin ==")
Download-File ("https://hf-mirror.com/ggml-org/whisper.cpp/resolve/main/ggml-" + $Size + ".bin") $Model @(
  ("https://huggingface.co/ggml-org/whisper.cpp/resolve/main/ggml-" + $Size + ".bin")
)
Write-Host "  模型就位：" $Model

# 3. ffmpeg
$FZip = Join-Path $Tmp "ffmpeg.zip"
Write-Host "== 3/3 ffmpeg =="
Download-File "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" $FZip @()
Expand-Archive -Path $FZip -DestinationPath (Join-Path $Tmp "ffmpeg") -Force
$ff = Get-ChildItem -Path (Join-Path $Tmp "ffmpeg") -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if ($null -eq $ff) { throw "ffmpeg 包内未找到 ffmpeg.exe" }
Copy-Item $ff.FullName (Join-Path $FfmpegDir "ffmpeg.exe") -Force
Write-Host "  ffmpeg 就位"

Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "=== 安装完成 ==="
Write-Host "验证：voice.cmd probe"
Write-Host "试转写：voice.cmd file 你的音频文件"
Write-Host "持续识别：voice.cmd listen（立体声混音设备号）"
