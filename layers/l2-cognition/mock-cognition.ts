// Genesis-1 角色运行时骨架 · L2 mock Cognition（附件 A 3.8 / 任务书 6.3）
// 返回 AsyncIterable<CognitionOutput>；可配置超时/超限路径与脚本。
// 适配器持有 persona（Q5：host 注入；composition 本地 duck-typed 桥接取用）。
import type { Clock } from "../../core/contract/clock";
import type { Cognition, CognitionContext, CognitionInput, CognitionOutput } from "../../core/contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import type { Logger } from "../../core/contract/pipeline-hook";
import type { PersonaCardV3 } from "../../core/contract/persona";

function isAsyncIterable(x: unknown): x is AsyncIterable<CognitionOutput> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as AsyncIterable<CognitionOutput>)[Symbol.asyncIterator] === "function"
  );
}

export type MockScript = (
  input: CognitionInput,
) => AsyncIterable<CognitionOutput> | Promise<CognitionOutput> | CognitionOutput | CognitionOutput[];

export interface MockCognitionOptions {
  id?: string;
  persona: PersonaCardV3;
  /** 不传则使用默认回显脚本：emotion + speech */
  script?: MockScript;
}

export interface MockCognition extends Cognition {
  /** 适配器持 persona（Q5 桥接取用点） */
  readonly persona: PersonaCardV3;
  /** 测试观察：收到的输入 */
  readonly inputs: CognitionInput[];
}

function defaultScript(input: CognitionInput): CognitionOutput[] {
  if (input.kind === "user_message") {
    return [
      {
        contractVersion: COGNITION_CONTRACT_VERSION,
        kind: "emotion",
        intent: { emotion: "happy", intensity: 0.6, contextTags: ["demo"] },
        vad: { valence: 0.6, arousal: 0.4, dominance: 0.2 },
      },
      {
        contractVersion: COGNITION_CONTRACT_VERSION,
        kind: "speech",
        speech: { text: `echo: ${input.text}`, interruptible: true },
      },
    ];
  }
  return [];
}

export function createMockCognition(opts: MockCognitionOptions): MockCognition {
  const inputs: CognitionInput[] = [];
  const script = opts.script ?? defaultScript;
  let clock: Clock | undefined;
  let logger: Logger | undefined;

  async function* toIterable(
    out: AsyncIterable<CognitionOutput> | Promise<CognitionOutput> | CognitionOutput | CognitionOutput[],
  ): AsyncIterable<CognitionOutput> {
    if (isAsyncIterable(out)) {
      yield* out;
      return;
    }
    const awaited = await out;
    if (Array.isArray(awaited)) {
      for (const o of awaited) yield o;
      return;
    }
    if (awaited !== undefined) yield awaited;
  }

  return {
    id: opts.id ?? "cognition:mock",
    persona: opts.persona,
    inputs,
    async mount(ctx: CognitionContext): Promise<void> {
      clock = ctx.clock;
      logger = ctx.logger;
      void clock;
      void logger;
    },
    onInput(input: CognitionInput): AsyncIterable<CognitionOutput> {
      inputs.push(input);
      return toIterable(script(input));
    },
    dispose(): void {
      // 最小实现：无资源
    },
  };
}
