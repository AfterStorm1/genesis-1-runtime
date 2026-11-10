// Genesis-1 · 聊天宿主：终端交互循环（runChatLoop）
// 职责：输入读取、命令分发（/记忆 /忘记 /情绪 /说 /quit）、情绪事件、长期记忆提炼、
//       情绪驱动（每 60s tick → 自主开口）、终止状态处理。
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import { createWhisperCppEngine, recordToFile, runtimeTmpDir } from "../../adapters/stt/whisper-engine";
import { fileSource } from "../../adapters/stt/voice-source";
import type { ChatRuntime } from "./chat-runtime";
import { sendUserMessage } from "./chat-runtime";

/** 语音转写引擎（/说 用：cloud→bin→py 自动选择，引擎未装时回退系统识别） */
const sttEngine = createWhisperCppEngine();

/** 终端交互循环（/quit 退出；/忘记 关键词 遗忘；/记忆 查看；/情绪 查看；/说 语音输入） */
export async function runChatLoop(chat: ChatRuntime): Promise<void> {
  const { persona, model, baseUrl, online, historyFile, longTerm } = chat;
  const summaryEvery = chat.env.summaryEvery; // 每 N 个用户回合提炼一次；0 关闭
  // eslint-disable-next-line no-console
  console.log(`[llm] mode=${online ? "online" : "local-ollama"} model=${model} baseUrl=${baseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[persona] loaded: ${persona.data.name}`);
  const activeLong = longTerm.list().filter((e) => e.archived !== true).length;
  // eslint-disable-next-line no-console
  console.log(
    `[memory] 短期历史 ${chat.history.list().length} 条 + 长期记忆 ${activeLong} 条；文件：${historyFile}`,
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

  // eslint-disable-next-line no-console
  console.log(
    `\n与「${persona.data.name}」聊天开始（/quit 退出 / 记忆 查看 / 忘记 关键词 遗忘 / 情绪 查看 / 说 语音输入）\n`,
  );

  if (chat.emotion !== undefined) {
    const s = chat.emotion.state();
    // eslint-disable-next-line no-console
    console.log(`[情绪] 初始 ${s.emotion}，强度 ${s.intensity.toFixed(2)}（夸奖/批评/安抚都会影响；情绪高了她会主动说话）`);
  }

  let userTurns = 0;
  // 情绪驱动循环：每 60 秒 tick 一次；波动超阈值时她会自主开口（离线自主生活最小实现）
  const driveTimer = setInterval(() => {
    void (async () => {
      if (chat.emotion === undefined || chat.guard.terminated) return;
      const intent = await chat.emotion.tick();
      if (intent !== null) {
        // eslint-disable-next-line no-console
        console.log("\n[自主] 情绪波动，蕙想说话……");
        await chat.rt.pipeline.handleInput({
          contractVersion: COGNITION_CONTRACT_VERSION,
          kind: "drive_intent",
          intent,
          persona: chat.persona,
        });
        await chat.whenRendered?.();
      }
    })();
  }, 60_000);

  for (;;) {
    const line = await ask("你 > ");
    const trimmed = line.trim();
    if (trimmed === "/quit" || trimmed === "/exit") break;
    if (trimmed === "") continue;

    // —— 终止状态：不再回应任何输入（/quit 仍有效）——
    if (chat.guard.terminated) {
      // eslint-disable-next-line no-console
      console.log("连接中断...");
      continue;
    }

    // —— 显式遗忘命令（事实与感受一起遗忘）——
    if (trimmed.startsWith("/忘记 ")) {
      const kw = trimmed.slice("/忘记 ".length);
      const nFacts = longTerm.forget(kw);
      const nFeel = chat.feelings.forget(kw);
      // eslint-disable-next-line no-console
      console.log(`已遗忘事实 ${nFacts} 条、感受 ${nFeel} 条（归档可回滚）`);
      continue;
    }
    if (trimmed === "/记忆") {
      const facts = longTerm.list().filter((e) => e.archived !== true);
      const feels = chat.feelings.list().filter((e) => e.archived !== true);
      if (feels.length > 0) {
        // eslint-disable-next-line no-console
        console.log("— 记忆中的感受 —");
        for (const e of feels) {
          // eslint-disable-next-line no-console
          console.log(`  · (${e.emotion}, 浓度${e.intensity.toFixed(2)}) ${e.text}`);
        }
      }
      if (facts.length === 0 && feels.length === 0) {
        // eslint-disable-next-line no-console
        console.log("（还没有长期记忆。多聊几轮，我会自动提炼。）");
      } else {
        // eslint-disable-next-line no-console
        console.log("— 记住的事实 —");
        for (const e of facts) {
          // eslint-disable-next-line no-console
          console.log(`  · [重要度${e.importance}] ${e.text}`);
        }
      }
      continue;
    }
    if (trimmed === "/情绪") {
      if (chat.emotion === undefined) {
        // eslint-disable-next-line no-console
        console.log("（情绪状态机未启用：CHAT_EMOTION=0）");
      } else {
        const s = chat.emotion.state();
        // eslint-disable-next-line no-console
        console.log(
          `[情绪] ${s.emotion} | 强度 ${s.intensity.toFixed(2)} | VAD v=${s.valence.toFixed(2)} a=${s.arousal.toFixed(2)} d=${s.dominance.toFixed(2)}`,
        );
      }
      continue;
    }

    // —— 语音输入（/说）：优先 whisper 引擎（录音→云端转写，有 STT_CLOUD_KEY 时质量最好）；
    //     引擎未装时回退 Windows SAPI。识别的文本走与打字完全相同的回复路径 ——
    let userText = trimmed;
    if (trimmed === "/说") {
      const sttProbe = sttEngine.probe();
      if (sttProbe.mode !== "none") {
        // eslint-disable-next-line no-console
        console.log(`（正在听…请说话，约 8 秒；后端 ${sttProbe.mode}）`);
        const tmp = path.join(runtimeTmpDir(), `genesis-say-${Date.now()}.wav`);
        try {
          await recordToFile(tmp, 8);
          const heard = await sttEngine.transcribeFile(fileSource(tmp, "麦克风"));
          if (heard.trim() === "") {
            // eslint-disable-next-line no-console
            console.log("（没听清，说 /说 再试一次）");
            continue;
          }
          // eslint-disable-next-line no-console
          console.log(`你(语音) > ${heard}`);
          userText = heard;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(`[stt] 识别失败：${err instanceof Error ? err.message : String(err)}`);
          continue;
        } finally {
          try {
            fs.rmSync(tmp, { force: true });
          } catch {
            /* 忽略清理失败 */
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.log("（正在听…请对着麦克风说话，最长 10 秒；系统识别）");
        try {
          const heard = await chat.recognizer.recognize(12_000);
          if (heard.trim() === "") {
            // eslint-disable-next-line no-console
            console.log("（没听清，说 /说 再试一次）");
            continue;
          }
          // eslint-disable-next-line no-console
          console.log(`你(语音) > ${heard}`);
          userText = heard;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log(`[stt] 识别失败：${err instanceof Error ? err.message : String(err)}（需要 Windows 中文语音识别语言包）`);
          continue;
        }
      }
    }

    // —— 情绪事件：分析输入并施加（夸奖/批评/安抚/亲近/压力）——
    if (chat.emotion !== undefined) {
      const before = chat.emotion.state().emotion;
      chat.emotion.applyText(userText);
      const after = chat.emotion.state();
      if (after.emotion !== before) {
        // eslint-disable-next-line no-console
        console.log(`[情绪] ${before} → ${after.emotion}（强度 ${after.intensity.toFixed(2)}）`);
      }
    }

    // 流式模式：先打印名字前缀，回复由渲染器逐句打字机输出
    if (chat.streamOutput) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} >`);
    }
    const { text, emotion } = await sendUserMessage(chat, userText);
    if (text === null) {
      // eslint-disable-next-line no-console
      console.log(chat.streamOutput ? "（超时或本句只有情绪无台词）" : `${persona.data.name} > （超时或本句只有情绪无台词）`);
    } else if (text === "连接中断...") {
      // 本轮触发终止：渲染器没有收到回复，由主循环输出
      // eslint-disable-next-line no-console
      console.log("连接中断...");
    } else if (!chat.streamOutput) {
      // eslint-disable-next-line no-console
      console.log(`${persona.data.name} (${emotion}) > ${text}`);
    }

    // 流式模式：等打字机播完再显示下一个输入提示，避免回复串进“你 >”输入行
    await chat.whenRendered?.();

    // —— 长期记忆提炼（每 summaryEvery 个用户回合一次）——
    userTurns += 1;
    if (summaryEvery > 0 && userTurns % summaryEvery === 0) {
      // eslint-disable-next-line no-console
      console.log("（正在提炼长期记忆…本地模型这一步会慢一点）");
      const recent = chat.history
        .list()
        .slice(-12)
        .map((i) => `${i.role === "user" ? "用户" : persona.data.name}：${i.content}`)
        .join("\n");
      try {
        const { facts, feelings } = await chat.summarizer.summarize(recent);
        for (const t of facts) longTerm.add(t);
        for (const f of feelings) chat.feelings.add(f.text, f.emotion);
        const nowFacts = longTerm.list().filter((e) => e.archived !== true).length;
        const nowFeels = chat.feelings.list().filter((e) => e.archived !== true).length;
        // eslint-disable-next-line no-console
        console.log(`[memory] 新增事实 ${facts.length} 条 + 感受 ${feelings.length} 条（现存 事实${nowFacts}/感受${nowFeels}）`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`[memory] 提炼失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  rl.close();
  clearInterval(driveTimer);
  chat.recognizer.dispose();
  await chat.rt.dispose();
  // eslint-disable-next-line no-console
  console.log("已退出。长期记忆与历史已保存。");
}
