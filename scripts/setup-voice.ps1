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

# 0. 自动发现 whisper.cpp 预编译包的真实下载地址
function Find-WhisperAssetUrl() {
  # 方式一：GitHub API 列最新 release 资源（不依赖版本号；同时打印真实资源名便于排查）
  foreach ($api in @("https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest")) {
    try {
      $rel = Invoke-RestMethod -Uri $api -TimeoutSec 60 -Headers @{ "User-Agent" = "genesis-setup" }
      Write-Host ("  最新版本：" + $rel.tag_name)
      $names = ($rel.assets | ForEach-Object { $_.name }) -join ", "
      Write-Host ("  资源列表：" + $names)
      foreach ($a in $rel.assets) {
        if ($a.name -like "whisper-bin*.zip" -or $a.name -like "*bin*x64*.zip" -or $a.name -like "whisper*.zip") {
          Write-Host "  选中资源：" $a.name
          return $a.browser_download_url
        }
      }
      Write-Host "  最新 release 无匹配资源，改用候选版本…"
    } catch {
      Write-Host ("  API 查询失败（" + $_.Exception.Message + "），改用候选版本…")
    }
  }
  # 方式二：候选版本与资源名逐个探测（最新版本号放最前）
  foreach ($v in @($rel.tag_name, "v1.7.5", "v1.7.4", "v1.7.3", "v1.7.2", "v1.7.1", "v1.7.0", "v1.6.2")) {
    foreach ($name in @("whisper-bin-x64.zip", "whisper-bin-x64-$v.zip", "whisper-bin.zip")) {
      $url = "https://github.com/ggml-org/whisper.cpp/releases/download/$v/$name"
      try {
        $r = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 20
        if ($r.StatusCode -eq 200) { Write-Host "  发现资源：" $url; return $url }
      } catch { }
    }
  }
  return $null
}

# 1. whisper.cpp 预编译包（含 whisper-cli.exe / whisper-stream.exe）
$WZip = Join-Path $Tmp "whisper.zip"
Write-Host "== 1/3 whisper.cpp =="
$wUrl = Find-WhisperAssetUrl
if ($null -eq $wUrl) {
  throw "找不到 whisper.cpp 下载地址。请手动到 https://github.com/ggml-org/whisper.cpp/releases 下载 whisper-bin-x64.zip，解压出 whisper-cli.exe 与 whisper-stream.exe 放入 tools\whisper\ 后重新运行本脚本。"
}
Download-File $wUrl $WZip @(
  ("https://ghfast.top/" + $wUrl),
  ("https://mirror.ghproxy.com/" + $wUrl)
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
