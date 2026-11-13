# 音频慢放脚本（值级）：重采样慢放——播放采样率除以倍率，音高随之降低，零电音、零痕迹
# 用法：python scripts/audio-atempo.py <输入> <输出.wav> <倍率0.5~2.0>
import sys
import wave

import av
import numpy as np


def main() -> None:
    src, out, tempo_s = sys.argv[1:4]
    tempo = float(tempo_s)
    inp = av.open(src)
    st = inp.streams.audio[0]
    rate = st.codec_context.sample_rate
    res = av.AudioResampler(format="s16", layout="mono", rate=rate)
    chunks = []
    for f in inp.decode(st):
        for rf in res.resample(f):
            chunks.append(rf.to_ndarray())
    pcm = np.concatenate([c.ravel() for c in chunks]) if chunks else np.zeros(0, dtype=np.int16)
    # 核心：以 rate*tempo 的采样率写入 wav → 播放更慢、音高更低，无任何数字痕迹
    out_rate = max(4000, int(round(rate * tempo)))
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(out_rate)
        w.writeframes(pcm.tobytes())
    print(f"ok {out}", flush=True)


if __name__ == "__main__":
    main()
