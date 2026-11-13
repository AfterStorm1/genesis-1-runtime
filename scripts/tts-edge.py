# Edge TTS 合成脚本（值级；被 edge-tts.ts 调用）
# 参数：<文本文件> <输出mp3> <voice> <rate> <pitch>
# rate 如 "+10%"；pitch 如 "-2Hz"。文本走文件避免命令行编码问题。
import asyncio
import pathlib
import sys

import edge_tts


def main() -> None:
    text_file, out, voice, rate, pitch = sys.argv[1:6]
    text = pathlib.Path(text_file).read_text(encoding="utf-8")

    async def run() -> None:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(out)

    asyncio.run(run())
    print("ok", flush=True)


if __name__ == "__main__":
    main()
