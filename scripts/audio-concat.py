# 音频拼接脚本（值级）：多个音频按顺序拼接，句间插入指定静音，输出无损 wav
# 用法：python scripts/audio-concat.py <gap秒> <输出.wav> <输入1> <输入2> ...
import sys
import wave

import av
import numpy as np


def main() -> None:
    gap_s = float(sys.argv[1])
    out = sys.argv[2]
    files = sys.argv[3:]
    rate = 48000
    parts: list[np.ndarray] = []
    for i, f in enumerate(files):
        c = av.open(f)
        st = c.streams.audio[0]
        rate = st.codec_context.sample_rate
        res = av.AudioResampler(format="s16", layout="mono", rate=rate)
        chunks = []
        for fr in c.decode(st):
            for rf in res.resample(fr):
                chunks.append(rf.to_ndarray())
        pcm = np.concatenate(chunks).ravel() if chunks else np.zeros(0, dtype=np.int16)
        parts.append(pcm)
        if i < len(files) - 1:
            parts.append(np.zeros(int(rate * gap_s), dtype=np.int16))
    joined = np.concatenate(parts) if parts else np.zeros(0, dtype=np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(joined.tobytes())
    print(f"ok {out}", flush=True)


if __name__ == "__main__":
    main()
