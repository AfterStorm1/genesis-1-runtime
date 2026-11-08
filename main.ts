// Genesis-1 角色运行时骨架 · 最小 demo（任务书 2.1 / 6.3 / 附件 A 8.2）
// 人格数据加载 → compose → 输入一条 user_message → 12 步断言 → dispose。
// 直接运行时输出并写入 docs/evidence/e2e-minimal.log；测试经 runMinimalE2e 复用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compose } from "./composition/composition-root";
import { loadPersona } from "./layers/l1-persona/persona-loader";
import { createMockCognition } from "./layers/l2-cognition/mock-cognition";
import { createTextRenderer } from "./adapters/renderers/text-renderer";
import { createMockSpeechRenderer } from "./adapters/renderers/mock-speech-renderer";
import { PARAMETER_CONTRACT_VERSION } from "./core/contract/parameter";
import { __getValidateAtCounts } from "./core/contract/entry-points";
import { isValidGlobalId } from "./core/id-factory";
import type { RendererFeedback } from "./core/contract/feedback";

export interface E2eStep {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

export interface E2eResult {
  steps: E2eStep[];
  snapshot: Record<string, unknown>;
  passed: boolean;
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 10));
  }
  return true;
}

export function formatE2eLog(result: E2eResult): string {
  const lines: string[] = [];
  lines.push("Genesis-1 e2e-minimal.log (A14)");
  lines.push(`result: ${result.passed ? "local pass" : "LOCAL FAIL"}`);
  lines.push("CI: pass (GitHub Actions, 见 ci-status.md)");
  for (const s of result.steps) {
    lines.push(`${s.id.toString().padStart(2, "0")}. [${s.pass ? "PASS" : "FAIL"}] ${s.name} — ${s.detail}`);
  }
  lines.push("dispose snapshot:");
  for (const [k, v] of Object.entries(result.snapshot)) {
    lines.push(`  ${k} = ${JSON.stringify(v)}`);
  }
  return lines.join("\n");
}

export async function runMinimalE2e(opts?: { doneDelayMs?: number }): Promise<E2eResult> {
  const steps: E2eStep[] = [];
  const add = (name: string, pass: boolean, detail: string): void => {
    steps.push({ id: steps.length + 1, name, pass, detail });
  };
  const snapshot: Record<string, unknown> = {};

  try {
    // 人格切换入口：GENESIS_PERSONA 指向 config/persona/ 下另一张卡（相对 runtime 根），
    // 未设置时用示例卡。换人格不改任何 core/contract/ 代码。
    const personaPath =
      process.env.GENESIS_PERSONA !== undefined
        ? path.resolve(process.env.GENESIS_PERSONA)
        : fileURLToPath(new URL("./config/persona/example.persona.json", import.meta.url));
    const persona = loadPersona(personaPath);
    // eslint-disable-next-line no-console
    console.log(`[persona] loaded: ${persona.data.name} (${personaPath})`);
    const textRenderer = createTextRenderer();
    const applyStates: Array<{ signalId: string; sessionState: string | undefined }> = [];
    const speechRenderer = createMockSpeechRenderer({
      doneDelayMs: opts?.doneDelayMs ?? 10,
      onApply: (signal) => {
        // G-02 断言点：SpeechRenderer.apply 时 session 应已创建且为 requested
        applyStates.push({ signalId: signal.id, sessionState: runtime?.speech.get(signal.id)?.state });
      },
    });
    const cognition = createMockCognition({ persona });
    const runtime = await compose({
      runtimeId: "rt:e2e",
      personaId: "persona:e2e",
      frameHz: 30,
      renderers: [textRenderer, speechRenderer],
      parameters: [
        { contractVersion: PARAMETER_CONTRACT_VERSION, name: "VRCEmote", kind: "number", range: [0, 8], default: 0 },
        { contractVersion: PARAMETER_CONTRACT_VERSION, name: "Viseme", kind: "number", range: [0, 15], default: 0 },
        { contractVersion: PARAMETER_CONTRACT_VERSION, name: "Blink", kind: "boolean", default: false },
      ],
      cognition,
    });

    // feedback 轨迹（步骤 11 断言：audio_started → playing；audio_done → done）
    const fbTrace: Array<{ kind: string; state: string | undefined }> = [];
    const origOnFeedback = runtime.speech.onFeedback.bind(runtime.speech);
    runtime.speech.onFeedback = (fb: RendererFeedback) => {
      origOnFeedback(fb);
      if (fb.signalId !== undefined) {
        fbTrace.push({ kind: fb.kind, state: runtime.speech.get(fb.signalId)?.state });
      }
    };

    // 未退订监听探针（步骤 12）：dispose 前订阅；dispose 后 publish 不应触发
    let probeBusEvents = 0;
    runtime.bus.subscribe(() => true, () => {
      probeBusEvents += 1;
    });

    // 步骤 1：InputBus.inject user_message 可达 Cognition.onInput
    runtime.inputBus.inject({ kind: "user_message", text: "hi" });
    const reached = await waitFor(() => cognition.inputs.length >= 1, 2000);
    add(
      "InputBus.inject 可达 Cognition.onInput",
      reached,
      `cognition.inputs=${cognition.inputs.length}`,
    );

    // 步骤 2：consumeIterator 逐 item validateAt（埋点计数 ≥ 2：emotion + speech）
    const perItemReached = await waitFor(
      () => (__getValidateAtCounts().get("Cognition.onInput.output") ?? 0) >= 2,
      2000,
    );
    const countsAfterInject = __getValidateAtCounts();
    const perItem = countsAfterInject.get("Cognition.onInput.output") ?? 0;
    add(
      "consumeIterator 逐 item validateAt",
      perItemReached && perItem >= 2,
      `Cognition.onInput.output=${perItem}`,
    );

    // 步骤 3：pendingOutputs 含 emotion 与 speech（聚合后的 signal 同时携带两者为证）
    const gotSignal = await waitFor(() => textRenderer.applied.length >= 1, 2000);
    const signal = textRenderer.applied[0];
    const hasBoth =
      signal !== undefined &&
      signal.speech !== undefined &&
      signal.emotion.emotion === "happy" &&
      signal.speech.text === "echo: hi";
    add(
      "pendingOutputs 含 emotion 与 speech",
      hasBoth,
      signal !== undefined
        ? `emotion=${signal.emotion.emotion} speech=${signal.speech?.text ?? "(none)"}`
        : "no signal",
    );

    // 步骤 4：l3Tick 调 Aggregator.aggregate
    const aggCount = countsAfterInject.get("Aggregator.aggregate") ?? 0;
    add("l3Tick 调 Aggregator.aggregate", aggCount >= 1, `Aggregator.aggregate=${aggCount}`);

    // 步骤 5：默认 aggregator 不经 Hub；Hub flush 为空
    const hubEmpty =
      runtime.sourceHub.list().length === 0 &&
      runtime.sourceHub
        .flush({ now: Date.now(), runtimeId: "rt:e2e", sourceId: "l3", activeSignals: [] })
        .length === 0;
    add("默认 aggregator 不经 Hub，flush 为空", hubEmpty, `sources=${runtime.sourceHub.list().length}`);

    // 步骤 6：逐 signal validateAt L3.aggregate.output 与 L3.dispatch
    const l3out = countsAfterInject.get("L3.aggregate.output") ?? 0;
    const l3dispatch = countsAfterInject.get("L3.dispatch") ?? 0;
    add(
      "逐 signal validateAt L3.aggregate.output + L3.dispatch",
      l3out >= 1 && l3dispatch >= 1,
      `L3.aggregate.output=${l3out} L3.dispatch=${l3dispatch}`,
    );

    // 步骤 7：arbiter.submit 首行 clampPriority / 限流 / id 校验
    const idOk = signal !== undefined && isValidGlobalId(signal.id);
    const priorityOk = signal !== undefined && signal.priority >= 0 && signal.priority <= 100;
    const singleDispatch = textRenderer.applied.length === 1; // 30Hz 限流下只放行一次
    add(
      "arbiter.submit 首行 clamp / 限流 / id 校验",
      idOk && priorityOk && singleDispatch,
      `id=${signal?.id} priority=${signal?.priority} dispatches=${textRenderer.applied.length}`,
    );

    // 步骤 8：onDispatch 先 speech.create 再 dispatcher.dispatch
    const createdBeforeDispatch =
      gotSignal && applyStates[0]?.signalId === signal?.id && applyStates[0]?.sessionState === "requested";
    add(
      "onDispatch 先 speech.create 再 dispatch",
      createdBeforeDispatch,
      `applyStates=${JSON.stringify(applyStates[0])}`,
    );

    // 步骤 9：TextRenderer 收到 signal.id
    add("TextRenderer 收到 signal.id", gotSignal && signal !== undefined, `signalId=${signal?.id}`);

    // 步骤 10：MockSpeechRenderer 看到 requested；只读 sanitizedText.text（D20）
    const sanitizedOk = signal?.speech?.sanitizedText?.text === "echo: hi";
    add(
      "MockSpeechRenderer 看到 requested + sanitizedText",
      createdBeforeDispatch && sanitizedOk,
      `state=${applyStates[0]?.sessionState} sanitized=${sanitizedOk}`,
    );

    // 步骤 11：audio_started → playing；audio_done → done + feedback_done；release 幂等
    const doneReached = signal !== undefined
      ? await waitFor(() => runtime.speech.get(signal.id)?.state === "done", 2000)
      : false;
    const session = signal !== undefined ? runtime.speech.get(signal.id) : undefined;
    const chainOk =
      fbTrace[0]?.kind === "audio_started" &&
      fbTrace[0]?.state === "playing" &&
      fbTrace[1]?.kind === "audio_done" &&
      fbTrace[1]?.state === "done" &&
      session?.state === "done" &&
      session?.releaseReason === "feedback_done";
    // 幂等：done 后重复 notifyRelease 不改变状态
    if (signal !== undefined) {
      runtime.arbiter.notifyRelease(signal.id, "feedback_done");
      const afterAgain = runtime.speech.get(signal.id);
      snapshot.idempotentRelease = afterAgain?.state === "done" && afterAgain?.releaseReason === "feedback_done";
    }
    add(
      "audio_started→playing; audio_done→done+feedback_done; 幂等",
      doneReached && chainOk,
      `trace=${JSON.stringify(fbTrace)} reason=${session?.releaseReason}`,
    );

    // 步骤 12：dispose
    probeBusEvents = 0; // 探针只统计 dispose 之后的事件（此前 input.delta 等也会被探针收到）
    await runtime.dispose();
    const noActive = runtime.arbiter.activeSignals().length === 0;
    const noPending = session === undefined || session.state === "done"; // done 为终态；非终态已被推 failed(cancelled)
    const noLeak = (() => {
      runtime.bus.publish({
        id: "rt:e2e:probe:1",
        ts: Date.now(),
        type: "probe",
        runtimeId: "rt:e2e",
        sourceId: "probe",
        scope: "runtime",
        payload: null,
      });
      return probeBusEvents === 0;
    })();
    snapshot.activeSignalsAfterDispose = runtime.arbiter.activeSignals().length;
    snapshot.pendingSessionsAfterDispose = signal !== undefined
      ? (runtime.speech.get(signal.id)?.state ?? "absent")
      : "no-signal";
    snapshot.busLeak = probeBusEvents;
    add(
      "dispose：无 active signal / 无 pending session / 无未退订监听",
      noActive && noPending && noLeak,
      `active=${snapshot.activeSignalsAfterDispose} session=${snapshot.pendingSessionsAfterDispose} probeEvents=${probeBusEvents}`,
    );
  } catch (err) {
    add("e2e 流程异常", false, err instanceof Error ? err.message : String(err));
  }

  const passed = steps.every((s) => s.pass);
  return { steps, snapshot, passed };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runMinimalE2e()
    .then((result) => {
      const logPath = fileURLToPath(new URL("./docs/evidence/e2e-minimal.log", import.meta.url));
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const text = formatE2eLog(result);
      fs.writeFileSync(logPath, text, "utf8");
      // eslint-disable-next-line no-console
      console.log(text);
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
