# 音频体检脚本（值级）：时长 / 峰值 / 首尾静音 / 有效语音时长
# 用途：语音合成后的质检——空文件、纯静音、只吐了半句、尾音被硬切，都要能被判出来。
# 用法：python scripts/audio-inspect.py <输入音频>
# 输出：一行 JSON（解析失败时 ok=false 并给理由）
import json
import sys

import av
import numpy as np


def main() -> None:
    src = sys.argv[1]
    try:
        with av.open(src) as c:
            st = c.streams.audio[0]
            rate = st.codec_context.sample_rate
            res = av.AudioResampler(format="s16", layout="mono", rate=rate)
            chunks = []
            for fr in c.decode(st):
                for rf in res.resample(fr):
                    chunks.append(rf.to_ndarray())
            for rf in res.resample(None):
                chunks.append(rf.to_ndarray())
    except Exception as e:  # 坏文件/空文件
        print(json.dumps({"ok": False, "reason": f"decode: {e}"[:200]}), flush=True)
        return

    if not chunks:
        print(json.dumps({"ok": False, "reason": "empty"}), flush=True)
        return

    pcm = np.concatenate([c.ravel() for c in chunks]).astype(np.float32) / 32768.0
    n = len(pcm)
    if n == 0:
        print(json.dumps({"ok": False, "reason": "empty"}), flush=True)
        return

    peak = float(np.abs(pcm).max())
    thr = max(peak * 0.02, 0.003)  # 相对峰值 2% 且绝对 -50dB 以上才算“有声音”
    idx = np.where(np.abs(pcm) > thr)[0]
    if len(idx) == 0:
        print(json.dumps({"ok": False, "reason": "silent", "duration": round(n / rate, 3), "peak": round(peak, 4)}), flush=True)
        return

    head = float(idx[0]) / rate
    tail = float(n - 1 - idx[-1]) / rate
    voiced = float(idx[-1] - idx[0] + 1) / rate
    print(
        json.dumps(
            {
                "ok": True,
                "sampleRate": rate,
                "duration": round(n / rate, 3),
                "peak": round(peak, 4),
                "headSilence": round(head, 3),
                "tailSilence": round(tail, 3),
                "voiced": round(voiced, 3),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
