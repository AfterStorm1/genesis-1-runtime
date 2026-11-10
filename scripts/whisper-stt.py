# Genesis-1 · faster-whisper 转写后端（Python 兜底，与 whisper.cpp 二进制互备）
# 用法：tools\whisper-py\Scripts\python.exe scripts\whisper-stt.py file <音频路径>
#       tools\whisper-py\Scripts\python.exe scripts\whisper-stt.py stream
# 模型首次使用自动下载（经 HF_ENDPOINT，默认国内镜像 hf-mirror.com）
import argparse
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
# 缓存放进项目自己的 data 目录：规避用户目录 .cache 的权限问题（WinError 5）
_RUNTIME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("HF_HOME", os.path.join(_RUNTIME, "data", "hf-cache"))

# 兼容垫片：新版 PyAV 移除了 metadata_errors 参数，而 faster-whisper 仍在传它。
# 在 av.open 上包一层，摘掉该参数（语义不变：只是忽略元数据错误）。
try:
    import av as _av

    _orig_open = _av.open

    def _open_compat(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return _orig_open(*args, **kwargs)

    _av.open = _open_compat  # type: ignore[assignment]
except Exception:
    pass  # 若未来不再需要，静默跳过

# 词表偏置：把人设常用词写进 initial_prompt，减少同音字错误（如 蕙→会）
INITIAL_PROMPT = "简体中文普通话对话。常见人名与词：蕙、旧书铺、河边、做饭、修东西、坐吧、谢谢、不清楚、加班。"


def _transcribe_kwargs() -> dict:
    return {"language": "zh", "vad_filter": True, "initial_prompt": INITIAL_PROMPT}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["file", "stream", "record", "convert"])
    ap.add_argument("path", nargs="?")
    ap.add_argument("--out", default=None)
    ap.add_argument("--model-size", default=os.environ.get("WHISPER_MODEL_SIZE", "base"))
    args = ap.parse_args()

    # convert：任意音频（amr/silk/mp3…）→ 16k 单声道 wav（云端 API 只收标准格式）
    if args.mode == "convert":
        if not args.path or not args.out:
            print("convert 需要 path 与 --out", file=sys.stderr)
            sys.exit(2)
        import wave

        import numpy as np
        from faster_whisper.audio import decode_audio

        audio = decode_audio(args.path)  # 已是 16k 单声道 float32
        with wave.open(args.out, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes((audio * 32767).astype(np.int16).tobytes())
        print("[stt] 转换完成", flush=True)
        return

    # record：默认麦克风录音 N 秒存为 16k wav（供 /说 与云端转写配合）
    if args.mode == "record":
        if not args.path:
            print("missing path", file=sys.stderr)
            sys.exit(2)
        import wave

        import numpy as np
        import sounddevice as sd

        secs = float(os.environ.get("STT_RECORD_SECONDS", "8"))
        fs = 16000
        print(f"[stt] 录音 {secs:g} 秒…", flush=True)
        audio = sd.rec(int(fs * secs), samplerate=fs, channels=1, dtype="float32")
        sd.wait()
        with wave.open(args.path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(fs)
            w.writeframes((audio * 32767).astype(np.int16).tobytes())
        print("[stt] 录音完成", flush=True)
        return

    from faster_whisper import WhisperModel

    model = WhisperModel(args.model_size, device="cpu", compute_type="int8")

    if args.mode == "file":
        if not args.path:
            print("missing path", file=sys.stderr)
            sys.exit(2)
        segments, _info = model.transcribe(args.path, beam_size=5, **_transcribe_kwargs())
        text = "".join(s.text for s in segments).strip()
        sys.stdout.buffer.write(text.encode("utf-8"))
        return

    # stream：默认麦克风 5 秒块连续转写（打印一行即一句；立体声混音可用系统"录制"设为默认）
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError:
        print("stream 需要 sounddevice：pip install sounddevice numpy", file=sys.stderr)
        sys.exit(2)

    fs = 16000
    block = 5.0
    print("[stt-py] listening (Ctrl+C to stop)", flush=True)
    try:
        while True:
            audio = sd.rec(int(fs * block), samplerate=fs, channels=1, dtype="float32")
            sd.wait()
            segments, _ = model.transcribe(audio[:, 0], beam_size=1, **_transcribe_kwargs())
            for s in segments:
                t = s.text.strip()
                if t:
                    print(t, flush=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
