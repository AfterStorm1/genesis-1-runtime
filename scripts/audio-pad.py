# 音频垫静音脚本（值级）：解码 → 头尾垫静音 → 统一采样率写出无损 wav
# 为什么头也要垫：QQ 客户端开始播放时音频管线还没热，最前面 100~300ms 常常听不到，
#   头部留一点空白就吃掉这个损失；尾部同理（播放器收尾/转码会把末尾吃掉一点）。
# 用法：python scripts/audio-pad.py <输入> <输出> <尾静音秒> [头静音秒] [目标采样率] [峰值]
#   目标采样率 0/省略 = 保持输入采样率；峰值 0/省略 = 不做增益归一化
import sys
import wave

import av
import numpy as np


def main() -> None:
    src, out, sec = sys.argv[1:4]
    tail_s = float(sec)
    lead_s = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    target_rate = int(float(sys.argv[5])) if len(sys.argv) > 5 else 0
    peak_target = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0

    with av.open(src) as c:
        st = c.streams.audio[0]
        rate = target_rate if target_rate > 0 else st.codec_context.sample_rate
        res = av.AudioResampler(format="s16", layout="mono", rate=rate)
        chunks = []
        for fr in c.decode(st):
            for rf in res.resample(fr):
                chunks.append(rf.to_ndarray())
        for rf in res.resample(None):  # 必须 flush，否则末尾几十毫秒会被丢掉
            chunks.append(rf.to_ndarray())

    pcm = np.concatenate([c.ravel() for c in chunks]).astype(np.float32) if chunks else np.zeros(0, dtype=np.float32)
    pcm = np.ravel(pcm)

    # 峰值归一化（默认不做）：QQ 语音听感偏小，统一到 -1.9dBFS 左右更清楚
    if peak_target > 0 and len(pcm) > 0:
        peak = float(np.abs(pcm).max())
        if peak > 0:
            pcm = pcm * (peak_target * 32767.0 / peak)

    pcm = np.clip(pcm, -32768, 32767).astype(np.int16)
    lead = np.zeros(int(rate * lead_s), dtype=np.int16)
    tail = np.zeros(int(rate * tail_s), dtype=np.int16)
    out_pcm = np.concatenate([lead, pcm, tail])

    # 边界 8ms 淡入淡出，防止垫静音接缝处“咔”一声
    fade = min(int(rate * 0.008), len(out_pcm) // 2)
    if fade > 0:
        out_pcm[:fade] = (out_pcm[:fade] * np.linspace(0, 1, fade)).astype(np.int16)
        out_pcm[-fade:] = (out_pcm[-fade:] * np.linspace(1, 0, fade)).astype(np.int16)

    wout = out[:-4] + ".wav" if out.lower().endswith(".mp3") else out
    with wave.open(wout, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(out_pcm.tobytes())
    print(f"ok {wout}", flush=True)


if __name__ == "__main__":
    main()
