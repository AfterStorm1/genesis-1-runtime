# 音频垫静音脚本（值级）：解码 → 末尾追加静音 → 输出无损 wav（避免 mp3 二次压缩产生电音）
# 用法：python scripts/audio-pad.py <输入> <输出> <静音秒数>
import sys
import wave

import av
import numpy as np


def main() -> None:
    src, out, sec = sys.argv[1:4]
    sec = float(sec)
    with av.open(src) as c:
        s = c.streams.audio[0]
        rate = s.codec_context.sample_rate
        res = av.AudioResampler(format="s16", layout="mono", rate=rate)
        chunks = []
        for frame in c.decode(s):
            for rf in res.resample(frame):
                chunks.append(rf.to_ndarray())
        for rf in res.resample(None):
            chunks.append(rf.to_ndarray())
    pcm = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.int16)
    pcm = np.ravel(pcm)
    pad = np.zeros(int(rate * sec), dtype=np.int16)
    out_pcm = np.concatenate([pcm, pad])
    wout = out[:-4] + ".wav" if out.lower().endswith(".mp3") else out
    with wave.open(wout, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(out_pcm.tobytes())
    print(f"ok {wout}", flush=True)


if __name__ == "__main__":
    main()
