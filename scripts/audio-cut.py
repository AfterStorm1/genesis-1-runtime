# 音频裁剪脚本（值级）：av 解码 → 裁切时间片段 → 输出单声道 wav（保持原采样率，保真）
# 用法：python scripts/audio-cut.py <输入> <起始秒> <结束秒> <输出.wav>
import sys
import wave

import av
import numpy as np


def main() -> None:
    src, start_s, end_s, out = sys.argv[1:5]
    start = float(start_s)
    end = float(end_s)
    with av.open(src) as container:
        stream = container.streams.audio[0]
        rate = stream.codec_context.sample_rate
        container.seek(int(start * av.time_base), stream=stream)
        resampler = av.AudioResampler(format="s16", layout="mono", rate=rate)
        chunks: list[np.ndarray] = []
        total = 0
        need = int((end - start) * rate)
        for frame in container.decode(stream):
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray())
                total += rf.samples
            if total >= need:
                break
        for rf in resampler.resample(None):
            chunks.append(rf.to_ndarray())
            total += rf.samples
    pcm = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    print(f"ok: {out} ({len(pcm) / rate:.2f}s @ {rate}Hz)", flush=True)


if __name__ == "__main__":
    main()
