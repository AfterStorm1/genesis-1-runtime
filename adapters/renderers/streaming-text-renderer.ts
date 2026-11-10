// Genesis-1 · 流式文本渲染器（值级，打字机式逐句输出）
// 契约语义不变：一个回复 = 一个 signal = 一个会话；流式只是「呈现方式」。
// apply 同步返回（契约要求），内部用定时器链异步逐字/逐句输出；
// dispose 取消全部未完成的输出；busy 重入保护（同回复期间丢弃新信号）。
import type { Renderer } from "../../core/contract/renderer";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";

export interface StreamingTextRendererOptions {
  /** 句内逐字延迟，默认 25ms */
  charDelayMs?: number;
  /** 句间延迟，默认 300ms */
  sentenceDelayMs?: number;
  /** 句间换行（默认 false：单行输出，句间用空格+停顿） */
  newlinePerSentence?: boolean;
  /** 输出通道，默认 process.stdout.write */
  write?: (chunk: string) => void;
}

export interface StreamingTextRenderer extends Renderer {
  readonly applied: ExpressionSignal[];
  /** 是否正在流式输出 */
  isBusy(): boolean;
  /** 等待当前流式输出结束（空闲时立即 resolve；dispose 也会解除等待） */
  whenIdle(): Promise<void>;
}

export function createStreamingTextRenderer(opts?: StreamingTextRendererOptions): StreamingTextRenderer {
  const charDelay = opts?.charDelayMs ?? 25;
  const sentenceDelay = opts?.sentenceDelayMs ?? 300;
  const sentenceSep = opts?.newlinePerSentence === true ? "\n" : " ";
  const write = opts?.write ?? ((chunk: string) => process.stdout.write(chunk));
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const applied: ExpressionSignal[] = [];
  let busy = false;
  let disposed = false;
  const idleWaiters: Array<() => void> = [];

  function markIdle(): void {
    busy = false;
    for (const w of idleWaiters.splice(0)) w();
  }

  function later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!disposed) fn();
    }, ms);
    timers.add(t);
  }

  function streamLines(lines: string[]): void {
    let li = 0;
    const nextLine = (): void => {
      if (disposed || li >= lines.length) {
        if (!disposed) write("\n");
        markIdle();
        return;
      }
      const line = lines[li++] ?? "";
      let ci = 0;
      const nextChar = (): void => {
        if (disposed || ci >= line.length) {
          if (!disposed) write(sentenceSep);
          later(sentenceDelay, nextLine);
          return;
        }
        write(line[ci++] ?? "");
        later(charDelay, nextChar);
      };
      nextChar();
    };
    nextLine();
  }

  return {
    id: "renderer:streaming-text",
    capabilities: {
      modalities: ["text"],
      consumesFrames: false,
      supportsInterruption: true,
      contractRanges: {
        expression: { min: EXPRESSION_CONTRACT_VERSION, max: EXPRESSION_CONTRACT_VERSION },
      },
    },
    applied,
    isBusy() {
      return busy;
    },
    whenIdle() {
      if (!busy) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    async mount(): Promise<void> {
      // 无资源
    },
    apply(signal: ExpressionSignal): void {
      applied.push(signal);
      if (disposed || busy) return; // dispose 后 / 同回复期间：丢弃
      const text = signal.speech?.sanitizedText?.text;
      if (text === undefined || text === "") return;
      busy = true;
      streamLines(text.split("\n"));
    },
    dispose(): void {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      markIdle(); // 解除 whenIdle 等待
    },
  };
}
