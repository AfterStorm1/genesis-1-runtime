# 音频变速脚本（值级）：相位声码器慢放（音高不变、音色不变），纯 numpy 零依赖
# 用法：python scripts/audio-atempo.py <输入> <输出.wav> <倍率0.5~2.0>
import sys
import wave

import av
import numpy as np


def phase_vocoder(x: np.ndarray, factor: float, n_fft: int = 1024, hop: int = 256) -> np.ndarray:
    win = np.hanning(n_fft)
    x = np.pad(x, (n_fft // 2, n_fft // 2))
    steps = 1 + (len(x) - n_fft) // hop
    frames = np.stack([x[i * hop : i * hop + n_fft] * win for i in range(steps)])
    spec = np.fft.rfft(frames, axis=1)
    mag = np.abs(spec)
    phase = np.angle(spec)
    freqs = np.arange(spec.shape[1]) * (2.0 * np.pi * hop / n_fft)
    dphase = np.diff(phase, axis=0, prepend=phase[:1])
    true = dphase - freqs
    true = true - 2.0 * np.pi * np.round(true / (2.0 * np.pi))
    true = true + freqs
    acc = np.cumsum(true, axis=0) + phase[0]

    t = np.arange(0, steps, factor)
    out_len = int(np.ceil(t[-1])) + 1 if len(t) > 0 else 1
    y = np.zeros(out_len * hop + n_fft, dtype=np.float64)
    norm = np.zeros_like(y)
    for i, ti in enumerate(t):
        i0 = int(np.floor(ti))
        i1 = min(i0 + 1, steps - 1)
        frac = ti - i0
        m = (1.0 - frac) * mag[i0] + frac * mag[i1]
        p = acc[i0] + frac * (acc[i1] - acc[i0])
        seg = np.fft.irfft(m * np.exp(1j * p), n_fft) * win
        pos = i * hop
        n = min(n_fft, len(y) - pos)
        if n <= 0:
            break
        y[pos : pos + n] += seg[:n]
        norm[pos : pos + n] += win[:n] * win[:n]
    y = y[n_fft // 2 :]
    norm = norm[n_fft // 2 :]
    y = y / np.maximum(norm, 1e-6)
    return y.astype(np.float32)


def main() -> None:
    src, out, tempo_s = sys.argv[1:4]
    tempo = float(tempo_s)
    inp = av.open(src)
    st = inp.streams.audio[0]
    rate = st.codec_context.sample_rate
    res = av.AudioResampler(format="fltp", layout="mono", rate=rate)
    chunks = []
    for f in inp.decode(st):
        for rf in res.resample(f):
            chunks.append(rf.to_ndarray())
    for rf in res.resample(None):
        chunks.append(rf.to_ndarray())
    audio = np.concatenate([c.ravel() for c in chunks]) if chunks else np.zeros(0, dtype=np.float32)
    stretched = phase_vocoder(audio, tempo)
    s16 = (np.clip(stretched, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(s16.tobytes())
    print(f"ok {out}", flush=True)


if __name__ == "__main__":
    main()
