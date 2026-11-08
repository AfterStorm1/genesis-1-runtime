// Genesis-1 角色运行时骨架 · Pipeline 实现（附件 A 4.4 / 3.8 / P1-5 / P1-R1 / D32）
// consumeIterator 为唯一实现（删除 onIteratorItem，避免双重校验）。
// 批次边界：超时/超限截断 + iterator.return() + 计时器释放；迭代器抛错整批失败。
// Promise 路径豁免批次约束。l3Tick：默认 aggregator 直接调用，Hub flush 额外 source，
// 拼接后逐个 validateAt L3.aggregate.output + L3.dispatch + arbiter.submit。
import type { AggregateContext, CognitionOutputAggregator } from "./contract/aggregator";
import { AGGREGATOR_CONTRACT_VERSION } from "./contract/aggregator";
import type { Cognition, CognitionInput, CognitionOutput } from "./contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "./contract/cognition";
import type { ExpressionSignal } from "./contract/expression";
import type { BusEvent } from "./contract/bus";
import type { MemoryStore, RecallResult } from "./contract/memory";
import type { ExpressionSourceHub } from "./contract/expression-source";
import type { PipelineHookChain } from "./contract/pipeline-hook";
import type { SafetyEnforcer } from "./contract/safety";
import type { ContractRegistry } from "./contract/versioning";
import type { Arbiter } from "./contract/arbitration";
import type { Principal } from "./contract/tool";
import type { Clock } from "./contract/clock";
import type { MotionRegistry } from "./contract/motion";
import type { PersonaCardV3 } from "./contract/persona";
import type { WorldDelta } from "./contract/perception";
import { isSanitizedText } from "./contract/speech";
import { validateAt } from "./contract/entry-points";
import { createIdFactory } from "./id-factory";

export interface Pipeline {
  /** BusEvent 入口（composition 的 bus.subscribe 接入） */
  onEvent(e: BusEvent): Promise<void>;
  /** 直接输入入口（测试/宿主可直达；同样走 handleInput 全链路） */
  handleInput(input: CognitionInput): Promise<void>;
}

export interface PipelineOptions {
  memory?: MemoryStore;
  cognition: Cognition;
  sourceHub: ExpressionSourceHub;
  aggregator: CognitionOutputAggregator;
  hooks: PipelineHookChain;
  safety: SafetyEnforcer;
  contract: ContractRegistry;
  principal: Principal;
  arbiter: Arbiter;
  motion: MotionRegistry;
  clock: Clock;
  runtimeId: string;
  persona: PersonaCardV3;
  memoryRecallTimeoutMs?: number;
  maxBatchOutputs?: number;
  batchTimeoutMs?: number;
}

function isAsyncIterable(x: unknown): x is AsyncIterable<CognitionOutput> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as AsyncIterable<CognitionOutput>)[Symbol.asyncIterator] === "function"
  );
}

function toCognitionInput(delta: WorldDelta, persona: PersonaCardV3): CognitionInput | null {
  switch (delta.kind) {
    case "user_message":
      return {
        contractVersion: COGNITION_CONTRACT_VERSION,
        kind: "user_message",
        text: delta.text ?? "",
        persona,
      };
    case "perception":
      if (delta.snapshot === undefined) return null;
      return {
        contractVersion: COGNITION_CONTRACT_VERSION,
        kind: "perception",
        snapshot: delta.snapshot,
        persona,
      };
    default:
      // world_entity 等：骨架不映射为认知输入（minimal per handbook; confirm）
      return null;
  }
}

export function createPipeline(opts: PipelineOptions): Pipeline {
  const {
    memory,
    cognition,
    sourceHub,
    aggregator,
    hooks,
    safety,
    contract,
    arbiter,
    motion,
    clock,
    runtimeId,
    persona,
    memoryRecallTimeoutMs = 50,
    maxBatchOutputs = 64,
    batchTimeoutMs = 2000,
  } = opts;

  const pendingOutputs: CognitionOutput[] = [];
  const idFactory = createIdFactory(runtimeId, "l3");

  async function recallWithTimeout(input: CognitionInput): Promise<RecallResult | undefined> {
    if (!memory?.recall) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), memoryRecallTimeoutMs);
    });
    try {
      const result = await Promise.race([memory.recall({ input }), timeout]);
      return result as RecallResult | undefined;
    } catch {
      return undefined; // 记忆异常降级：骨架行为
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function consumeIterator(
    iter: AsyncIterable<CognitionOutput>,
    deadline: number,
    buf: CognitionOutput[],
  ): Promise<void> {
    const it = iter as AsyncIterableIterator<CognitionOutput>;
    const timer = setTimeout(() => {
      void it.return?.();
    }, batchTimeoutMs);
    let failed = false;
    let truncated = false;
    try {
      for await (const out of it) {
        // 逐 item validateAt（P1-5），再进 buf
        validateAt("Cognition.onInput.output", { output: out }, contract);
        buf.push(out);
        if (buf.length >= maxBatchOutputs) {
          await it.return?.();
          truncated = true;
          break;
        }
        if (clock.now() > deadline) {
          await it.return?.();
          truncated = true;
          break;
        }
      }
    } catch (err) {
      // 迭代器抛错：整批失败，不产 signal，记 degraded；必须 return() 清理（D32）
      await it.return?.();
      failed = true;
      // eslint-disable-next-line no-console
      console.warn("[pipeline] batch_iterator_error", err);
    } finally {
      clearTimeout(timer);
    }
    if (failed) {
      buf.length = 0; // 整批失败：已收 outputs 不聚合（附件 A 3.8 规则 5）
      return;
    }
    if (truncated) {
      // 超时/超限：已收 outputs 正常聚合，记 degraded（附件 A 3.8 规则 4）
      // eslint-disable-next-line no-console
      console.warn("[pipeline] batch_truncated");
    }
  }

  async function l3Tick(now: number): Promise<void> {
    const outputs = pendingOutputs.splice(0, pendingOutputs.length);
    const activeSignals = arbiter.activeSignals();
    const ctx: AggregateContext = {
      contractVersion: AGGREGATOR_CONTRACT_VERSION,
      clock,
      motion,
      safety,
      contract,
      runtimeId,
      sourceId: "l3",
      activeSignalIds: activeSignals.map((s) => s.id),
      activeSignals,
      strategy: arbiter.strategy(),
      nextId: idFactory.next,
    };

    let fromAggregator: ExpressionSignal[] = [];
    if (outputs.length > 0) {
      // L3 收到裸 SpeechPayload：先 sanitize 填入 sanitizedText（3.9 规则 1）
      for (const out of outputs) {
        if (out.kind === "speech") {
          if (out.speech.sanitizedText === undefined || !isSanitizedText(out.speech.sanitizedText)) {
            out.speech.sanitizedText = safety.sanitize(out.speech.text);
          }
          if (safety.enforceSpeech(out.speech) === null) {
            // 强制点：L3 输出 speech 前 enforceSpeech，null → 拒绝该信号（记 degraded）
            // eslint-disable-next-line no-console
            console.warn("[pipeline] enforceSpeech rejected");
            continue;
          }
        }
      }
      const pre = await hooks.run("beforeAggregate", outputs);
      if (pre !== null) {
        validateAt("Aggregator.aggregate", { ctx }, contract);
        fromAggregator = aggregator.aggregate(pre, ctx);
        const post = await hooks.run("afterAggregate", fromAggregator);
        fromAggregator = post ?? [];
      }
    }

    const fromHub = sourceHub.flush({ now, runtimeId, sourceId: "l3", activeSignals });

    for (const raw of [...fromAggregator, ...fromHub]) {
      const s = await hooks.run("beforeArbiter", raw);
      if (s === null) continue;
      validateAt("L3.aggregate.output", { signal: s }, contract);
      validateAt("L3.dispatch", { signal: s }, contract);
      arbiter.submit(s);
      await hooks.run("afterArbiter", s);
    }
  }

  async function handleInput(input: CognitionInput): Promise<void> {
    validateAt("Cognition.onInput", { input }, contract);
    const hooked = await hooks.run("beforeCognition", input);
    if (hooked === null) return;
    const recall = await recallWithTimeout(hooked);
    const enriched: CognitionInput = { ...hooked, recall };
    const iter = cognition.onInput(enriched);
    const outputs: CognitionOutput[] = [];
    if (isAsyncIterable(iter)) {
      await consumeIterator(iter, clock.now() + batchTimeoutMs, outputs);
    } else {
      // Promise 路径：单 output 直接 validateAt 后进 pendingOutputs；不受批次约束（3.8 规则 7）
      const out = await iter;
      validateAt("Cognition.onInput.output", { output: out }, contract);
      outputs.push(out);
    }
    if (outputs.length > 0) {
      const after = await hooks.run("afterCognition", outputs);
      if (after !== null) pendingOutputs.push(...after);
    }
    await l3Tick(clock.now());
  }

  return {
    onEvent(e: BusEvent): Promise<void> {
      if (e.type !== "input.delta") return Promise.resolve();
      const input = toCognitionInput(e.payload as WorldDelta, persona);
      if (input === null) return Promise.resolve();
      return handleInput(input);
    },
    handleInput,
  };
}
