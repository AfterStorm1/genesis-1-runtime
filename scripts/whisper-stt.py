# Genesis-1 · faster-whisper 转写后端（Python 兜底，与 whisper.cpp 二进制互备）
# 用法：tools\whisper-py\Scripts\python.exe scripts\whisper-stt.py file <音频路径>
#       tools\whisper-py\Scripts\python.exe scripts\whisper-stt.py stream
# 模型首次使用自动下载（经 HF_ENDPOINT，默认国内镜像 hf-mirror.com）
import argparse
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["file", "stream"])
    ap.add_argument("path", nargs="?")
    ap.add_argument("--model-size", default=os.environ.get("WHISPER_MODEL_SIZE", "base"))
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    model = WhisperModel(args.model_size, device="cpu", compute_type="int8")

    if args.mode == "file":
        if not args.path:
            print("missing path", file=sys.stderr)
            sys.exit(2)
        segments, _info = model.transcribe(args.path, language="zh", vad_filter=True, beam_size=5)
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
            segments, _ = model.transcribe(audio[:, 0], language="zh", vad_filter=True, beam_size=1)
            for s in segments:
                t = s.text.strip()
                if t:
                    print(t, flush=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
