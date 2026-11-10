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

# 全程时间护栏：超过 12 分钟直接放弃（换方向，别死等）
$Sw = [Diagnostics.Stopwatch]::StartNew()
$DeadlineMinutes = 12

function Download-File([string]$Url, [string]$Out, [string[]]$Fallbacks) {
  $urls = @($Url) + $Fallbacks
  foreach ($u in $urls) {
    if ($Sw.Elapsed.TotalMinutes -gt $DeadlineMinutes) {
      throw "安装超时（已超过 $DeadlineMinutes 分钟，网络可能太慢）。建议：稍后重跑，或跳过语音引擎先做别的。"
    }
    try {
      Write-Host ("  下载 " + $u)
      Invoke-WebRequest -Uri $u -OutFile $Out -TimeoutSec 300
      if ((Get-Item $Out).Length -gt 1024) { Write-Host ("    完成 " + [math]::Round((Get-Item $Out).Length/1MB, 1) + " MB"); return }
    } catch {
      Write-Host ("    失败（" + $_.Exception.Message + "），尝试备用地址…")
    }
  }
  throw "下载失败：" + $Url
}

# 0. 自动发现 whisper.cpp 预编译包的真实下载地址（从新到旧找第一个仍带 zip 的 release）
function Find-WhisperAssetUrl() {
  try {
    $rels = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30" -TimeoutSec 60 -Headers @{ "User-Agent" = "genesis-setup" }
    foreach ($rel in $rels) {
      foreach ($a in $rel.assets) {
        # 只要 Windows 包：含 bin 且含 x64/win；排除 macOS(xcframework)/android/linux/arm 变体
        $isWin = ($a.name -like "*bin*.zip") -and ($a.name -like "*x64*" -or $a.name -like "*win*")
        $isForeign = $a.name -like "*xcframework*" -or $a.name -like "*android*" -or $a.name -like "*linux*" -or $a.name -like "*arm*" -or $a.name -like "*darwin*" -or $a.name -like "*macos*"
        if ($isWin -and -not $isForeign) {
          Write-Host ("  选中：" + $rel.tag_name + " / " + $a.name)
          return $a.browser_download_url
        }
      }
    }
    Write-Host "  近 30 个 release 均无 zip 资源，改用候选版本探测…"
  } catch {
    Write-Host ("  API 查询失败（" + $_.Exception.Message + "），改用候选版本探测…")
  }
  # 方式二：候选版本与资源名逐个探测
  foreach ($v in @("v1.7.5", "v1.7.4", "v1.7.3", "v1.7.2", "v1.7.1", "v1.7.0", "v1.6.2")) {
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

# 1. whisper.cpp 预编译包（含 whisper-cli.exe / whisper-stream.exe）；失败则回退 Python 后端
$WZip = Join-Path $Tmp "whisper.zip"
Write-Host "== 1/3 whisper.cpp =="
$wUrl = Find-WhisperAssetUrl
$usePy = $false
if ($null -eq $wUrl) {
  Write-Host "  whisper.cpp 二进制不可得，改用 Python 后端（faster-whisper）…"
  $usePy = $true
} else {
  try {
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
  } catch {
    Write-Host ("  whisper.cpp 安装失败（" + $_.Exception.Message + "），改用 Python 后端…")
    $usePy = $true
  }
}

if ($usePy) {
  Write-Host "== Python 后端 faster-whisper =="
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($null -eq $py) {
    throw "未安装 Python。请到 https://www.python.org/downloads/ 安装（勾选 Add to PATH）后重新运行本脚本；或手动下载 whisper.cpp 二进制放入 tools\whisper\。"
  }
  $pyVenv = Join-Path $Root "tools\whisper-py"
  if (-not (Test-Path (Join-Path $pyVenv "Scripts\python.exe"))) {
    Write-Host "  创建虚拟环境…"
    python -m venv $pyVenv
  }
  Write-Host "  安装 faster-whisper（清华 pip 镜像）…"
  & (Join-Path $pyVenv "Scripts\python.exe") -m pip install --quiet faster-whisper -i https://pypi.tuna.tsinghua.edu.cn/simple
  # 兼容性：whisper-stt.py 内置 av.open 垫片，任意 PyAV 版本均可（无需固定版本）
  & (Join-Path $pyVenv "Scripts\python.exe") -m pip install --quiet sounddevice numpy -i https://pypi.tuna.tsinghua.edu.cn/simple
  Write-Host "  Python 后端就位（首次转写会自动经 hf-mirror 下载模型）"
  Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "=== 安装完成（Python 后端）==="
  Write-Host "验证：voice.cmd probe（应显示 mode=py）"
  Write-Host "试转写：voice.cmd file 你的音频文件（首次会下载模型，稍慢）"
  exit 0
}

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
