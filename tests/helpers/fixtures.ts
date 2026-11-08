// 测试夹具：假时钟、可控 AsyncIterable、样本数据
import type { Clock, FrameSource } from "../../core/contract/clock";
import type { CognitionOutput } from "../../core/contract/cognition";
import type { ExpressionSignal } from "../../core/contract/expression";
import type { PersonaCardV3 } from "../../core/contract/persona";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";

export function createFakeClock(initial = 0): Clock & { advance(ms: number): void; set(ms: number): void; tick(): void } {
  let now = initial;
  const tickCbs = new Set<(tick: number, ts: number) => void>();
  let tick = 0;
  const frameSource: FrameSource = {
    hz: 60,
    onTick(cb) {
      tickCbs.add(cb);
      return () => {
        tickCbs.delete(cb);
      };
    },
    start() {},
    stop() {
      tickCbs.clear();
    },
  };
  return {
    now: () => now,
    frameSource,
    advance(ms) {
      now += ms;
    },
    set(ms) {
      now = ms;
    },
    /** 手动驱动一帧（假时钟不自动跑帧循环） */
    tick() {
      tick += 1;
      for (const cb of [...tickCbs]) {
        try {
          cb(tick, now);
        } catch {
          /* 隔离 */
        }
      }
    },
  };
}

/**
 * 真值轮询等待（注意：vitest 的 vi.waitFor 语义是「等到回调不抛异常」，
 * 不是等到返回真值，故测试统一用本助手）。
 */
export async function waitForTruthy(cond: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

export interface ControlledIter {
  iter: AsyncIterable<CognitionOutput> & { returnCalls: number };
  push(...outputs: CognitionOutput[]): void;
  end(): void;
  fail(err: unknown): void;
}

/**
 * 可控 AsyncIterable：手动推入输出、可观察 return() 调用（A09 用）。
 * 注意：return() 计数在「调用」层（patch 包装），而非 generator finally 完成层——
 * 挂起中的 async generator 只有在 await 的 Promise 结算后才会处理 return 完成信号，
 * 骨架只承诺「调用 return()」，故断言调用次数。
 */
export function createControlledIter(): ControlledIter {
  const queue: Array<CognitionOutput | { err: unknown } | { end: true }> = [];
  const waiters: Array<() => void> = [];
  let returnCalls = 0;

  async function* gen(): AsyncGenerator<CognitionOutput> {
    try {
      while (true) {
        while (queue.length === 0) {
          await new Promise<void>((r) => waiters.push(r));
        }
        const item = queue.shift()!;
        if ("end" in item && item.end === true) return;
        if ("err" in item) throw item.err;
        yield item as CognitionOutput;
      }
    } finally {
      /* 完成层不做计数（见上方说明） */
    }
  }

  const g = gen();
  const origReturn = g.return.bind(g);
  const patched: AsyncIterable<CognitionOutput> & { returnCalls: number } = Object.assign(g, {
    returnCalls: 0,
    return(value?: unknown): Promise<IteratorResult<CognitionOutput>> {
      returnCalls += 1;
      patched.returnCalls = returnCalls;
      return origReturn(value);
    },
  });

  return {
    iter: patched,
    push(...outputs) {
      queue.push(...outputs);
      for (const w of waiters.splice(0)) w();
    },
    end() {
      queue.push({ end: true });
      for (const w of waiters.splice(0)) w();
    },
    fail(err) {
      queue.push({ err });
      for (const w of waiters.splice(0)) w();
    },
  };
}

export function sampleSignal(overrides: Partial<ExpressionSignal> = {}): ExpressionSignal {
  return {
    contractVersion: EXPRESSION_CONTRACT_VERSION,
    id: "rt:test:l3:1",
    ts: 1000,
    emotion: { emotion: "neutral", intensity: 0.5, contextTags: [] },
    vad: { valence: 0, arousal: 0, dominance: 0 },
    priority: 50,
    interruptible: true,
    sourceId: "l3",
    runtimeId: "rt:test",
    ...overrides,
  };
}

export function samplePersona(name = "Test Persona"): PersonaCardV3 {
  return { spec: "chara_card_v3", data: { name } };
}

export const sampleEmotionOutput: CognitionOutput = {
  contractVersion: "1.0.0",
  kind: "emotion",
  intent: { emotion: "happy", intensity: 0.6, contextTags: ["test"] },
  vad: { valence: 0.6, arousal: 0.4, dominance: 0.2 },
};

export function sampleSpeechOutput(text: string, sanitized?: unknown): CognitionOutput {
  return {
    contractVersion: "1.0.0",
    kind: "speech",
    speech: { text, interruptible: true, sanitizedText: sanitized as never },
  };
}
