# 音频拼接脚本（值级）：多个音频按顺序拼接，句间插入指定静音，输出无损 wav
# 统一重采样到 24000Hz：云端 TTS 不同批次的产物采样率不固定（22050/24000 都见过），
# 混着拼会整条音调错乱；这里一次对齐，后面慢放/垫静音都在同一采样率上做。
# 用法：python scripts/audio-concat.py <gap秒> <输出.wav> <输入1> <输入2> ...
import sys
import wave

import av
import numpy as np

TARGET_RATE = 24000


def main() -> None:
    gap_s = float(sys.argv[1])
    out = sys.argv[2]
    files = sys.argv[3:]
    parts: list[np.ndarray] = []
    skipped = 0
    for i, f in enumerate(files):
        try:
            with av.open(f) as c:
                st = c.streams.audio[0]
                res = av.AudioResampler(format="s16", layout="mono", rate=TARGET_RATE)
                chunks = []
                for fr in c.decode(st):
                    for rf in res.resample(fr):
                        chunks.append(rf.to_ndarray())
                for rf in res.resample(None):  # 必须 flush，否则每句末尾几十毫秒被吞
                    chunks.append(rf.to_ndarray())
            pcm = np.concatenate([c.ravel() for c in chunks]) if chunks else np.zeros(0, dtype=np.int16)
            if len(pcm) == 0:
                skipped += 1
                print(f"skip empty: {f}", file=sys.stderr, flush=True)
                continue
            parts.append(pcm)
            if i < len(files) - 1:
                parts.append(np.zeros(int(TARGET_RATE * gap_s), dtype=np.int16))
        except Exception as e:  # 坏文件跳过，不影响其余句子
            skipped += 1
            print(f"skip bad: {f}: {e}", file=sys.stderr, flush=True)
    if not parts:
        print("no valid input", file=sys.stderr, flush=True)
        sys.exit(2)
    joined = np.concatenate(parts)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TARGET_RATE)
        w.writeframes(joined.tobytes())
    print(f"ok {out} (skipped {skipped})", flush=True)


if __name__ == "__main__":
    main()
