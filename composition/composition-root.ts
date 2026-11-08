// Genesis-1 角色运行时骨架 · 唯一装配点（附件 A 4.2 / D13 / P0-1 / D47）
// compose / dispose 固定顺序；Renderer.mount 顺序 await、失败反序清理；
// FrameCapability 两次校验并落表；feedback.subscribe 强制接线；
// dispose：arbiter.dispose() → unsubDispatch → unsubRelease → speech.dispose()。
import type { RuntimeConfig } from "../core/contract/runtime-config";
import type { BusEvent } from "../core/contract/bus";
import type { FrameCapability } from "../core/contract/frame-capability";
import type { Renderer, RendererContext } from "../core/contract/renderer";
import type { TrackingSource } from "../core/contract/scheduler";
import type { EntityRef, TrackingFrame } from "../core/contract/spatial";
import { ACTUATOR_CONTRACT_VERSION, TRACKING_CONTRACT_VERSION } from "../core/contract/spatial";
import type { WorldEntity } from "../core/contract/perception";
import type { Logger } from "../core/contract/pipeline-hook";
import type { PersonaCardV3 } from "../core/contract/persona";
import type { Cognition } from "../core/contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "../core/contract/cognition";
import { COMPONENT_CAPABILITY_CONTRACT_VERSION } from "../core/contract/component";
import { validateAt, SampledValidator } from "../core/contract/entry-points";
import { createContractRegistry } from "../core/migrate/contract-registry-impl";
import { createEventBus } from "../core/bus/event-bus-impl";
import { createClock } from "../core/clock/clock-impl";
import { createMotionRegistry } from "../core/motion/motion-registry-impl";
import { createParameterRegistry } from "../core/parameter/parameter-registry-impl";
import { mergeSafetyDefaults } from "../core/safety/merge";
import { createSafetyEnforcer } from "../core/safety/safety-enforcer-impl";
import { createSpeechSessionStore } from "../core/speech/speech-session-store-impl";
import { createFeedbackChannel } from "../core/feedback/feedback-channel-impl";
import { createInputBus } from "../core/input-bus/input-bus-impl";
import { createDefaultJSONSchemaValidator } from "../core/schema/default-json-schema-validator";
import { createToolRegistry } from "../core/tool/tool-registry-impl";
import { createRendererRegistry } from "../core/dispatch/renderer-registry-impl";
import { createSignalDispatcher } from "../core/dispatch/signal-dispatcher-impl";
import { createCapabilityLedger } from "../core/component/capability-ledger-impl";
import { createExpressionSourceHub } from "../core/source-hub/hub-impl";
import { createPipelineHookChain } from "../core/hook-chain/hook-chain-impl";
import { createArbiter } from "../core/arbiter/arbiter-impl";
import { createScheduler } from "../core/scheduler/scheduler-impl";
import { createFrameChannel } from "../core/scheduler/frame-channel-impl";
import { createPipeline } from "../core/pipeline";
import { derivePrincipal } from "../core/principal";
import { createIdFactory } from "../core/id-factory";
import { isProductionBuild } from "../core/runtime";
import type { RuntimeBundle } from "../core/runtime";
import { createDefaultAggregator } from "../layers/l3-expression/aggregator-default";
import { defaultStrategy } from "../layers/l3-arbiter/strategy-default";
import { createDefaultFusionStage } from "../layers/l35-scheduler/fusion-default";
import { createEmptyCognition } from "../adapters/llm/empty-cognition";

/** 多 Runtime 事件过滤（附件 A 1.1 / D31）：定向优先 */
export function shouldReceive(e: BusEvent, runtimeId: string): boolean {
  if (e.targetRuntimeId != null) return e.targetRuntimeId === runtimeId;
  if (e.scope === "world") return true;
  return e.runtimeId === runtimeId;
}

export const consoleLogger: Logger = {
  info(msg, data) {
    // eslint-disable-next-line no-console
    console.info(`[${msg}]`, data ?? "");
  },
  warn(msg, data) {
    // eslint-disable-next-line no-console
    console.warn(`[${msg}]`, data ?? "");
  },
  error(msg, data) {
    // eslint-disable-next-line no-console
    console.error(`[${msg}]`, data ?? "");
  },
};

/** 世界解析最小实现：骨架不实现实体解析（minimal per handbook; confirm） */
const worldResolver = async (_ref: EntityRef): Promise<WorldEntity | null> => null;

// Q5 桥接：persona 经 Cognition 适配器注入（任务书 §5 授权）；
// composition 以适配器本地 duck-typed 只读访问取用，不动跨层契约。
type PersonaHoldingCognition = { readonly persona?: PersonaCardV3 };

function personaOf(cognition: Cognition | undefined): PersonaCardV3 {
  const holder = cognition as PersonaHoldingCognition | undefined;
  if (holder !== undefined && holder.persona !== undefined) return holder.persona;
  // 兜底最小空卡（偏差清单：适配器未持 persona 时的占位，不写入契约）
  return { spec: "chara_card_v3", data: { name: "unset" } };
}

export async function compose(cfg: RuntimeConfig): Promise<RuntimeBundle> {
  if (isProductionBuild() && cfg.devOnly?.allowUnsanitizedSpeech) {
    throw new Error("devOnly.allowUnsanitizedSpeech is forbidden in production build");
  }

  const contract = createContractRegistry();
  const ownsBus = !cfg.sharedBus;
  const bus = cfg.sharedBus ?? createEventBus();
  const clock = createClock(cfg.frameHz);
  const motion = createMotionRegistry();
  const parameter = createParameterRegistry();
  const safetyRes = mergeSafetyDefaults(cfg.safety);
  if (safetyRes.adjusted.length > 0) consoleLogger.warn("safety_adjustments", safetyRes.adjusted);
  const safety = createSafetyEnforcer(safetyRes.merged, parameter, {
    allowUnsanitizedSpeech: cfg.devOnly?.allowUnsanitizedSpeech === true, // 生产已在上方静态拒绝
  });
  const speech = createSpeechSessionStore();
  const feedback = createFeedbackChannel();
  const inputBus = createInputBus(contract);
  const validator = cfg.schemaValidator ?? createDefaultJSONSchemaValidator();
  const tools = createToolRegistry(safety, contract, validator);

  contract.registerAll();

  for (const p of cfg.parameters) {
    validateAt("ParameterRegistry.register", { def: p }, contract);
    parameter.register(p);
  }

  for (const t of cfg.tools ?? []) {
    tools.register(t.def, t.handler); // Q4：impl 内部校验为唯一调用点，compose 不重复
  }

  const llmPrincipal = derivePrincipal("llm", cfg.runtimeId, cfg.personaId);

  const registry = createRendererRegistry();
  const rendererCtx: RendererContext = {
    clock,
    contract,
    feedback,
    bus,
    safety,
    runtimeId: cfg.runtimeId,
    sourceId: "renderer",
    resolveTarget: worldResolver,
  };
  const mounted: Renderer[] = [];
  try {
    for (const r of cfg.renderers) {
      validateAt("L4.register", { renderer: r }, contract);
      await r.mount(rendererCtx);
      mounted.push(r);
      registry.register(r); // 成功后才 register（G-03）
    }
  } catch (err) {
    for (const r of [...mounted].reverse()) {
      try {
        r.dispose();
      } catch {
        /* swallow during cleanup */
      }
    }
    throw new Error(`renderer_mount_failed:${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }

  const dispatcher = createSignalDispatcher(registry, feedback, clock);

  for (const r of mounted) {
    if (r.capabilities.consumesFrames) {
      const cap: FrameCapability = {
        id: r.id,
        contractVersion: ACTUATOR_CONTRACT_VERSION,
        contractRanges: r.capabilities.contractRanges,
        supportedParameters: r.capabilities.supportedParameters,
      };
      // 两次校验（version / capabilities，均传 { cap }）并落表（P1-R3 / D51 / P1-R6）
      validateAt("L4.registerFrameCapability", { cap }, contract);
      validateAt("L4.registerFrameCapability.ranges", { cap }, contract);
      registry.registerFrameCapability(cap);
    }
  }

  const ledger = createCapabilityLedger(contract);
  for (const r of mounted) {
    ledger.register(r.id, {
      contractVersion: COMPONENT_CAPABILITY_CONTRACT_VERSION,
      contractRanges: r.capabilities.contractRanges,
    });
  }

  const sourceHub = createExpressionSourceHub(contract);

  const hooks = createPipelineHookChain(contract, clock, consoleLogger);
  for (const h of cfg.hooks ?? []) {
    validateAt("PipelineHook.register", { hook: h }, contract);
    hooks.register(h);
  }

  for (const m of cfg.migrators ?? []) contract.registerMigrator(m.from, m.to, m.migrate);

  // Cognition mount 生命周期（偏差清单：手册 4.2 片段未展示；Cognition 契约要求 mount）
  if (cfg.cognition !== undefined) {
    await cfg.cognition.mount({ contractVersion: COGNITION_CONTRACT_VERSION, clock, logger: consoleLogger });
  }
  const cognition = cfg.cognition ?? createEmptyCognition();
  const persona = personaOf(cfg.cognition); // Q5：适配器持 persona + composition 本地桥接

  const arbiter = createArbiter({
    strategy: defaultStrategy,
    config: cfg.arbiter ?? { defaultMaxHoldMs: 30_000 },
    safety,
    clock,
    logger: consoleLogger,
  });

  const idFactory = createIdFactory(cfg.runtimeId, "runtime");

  const unsubDispatch = arbiter.onDispatch((signal) => {
    if (signal.speech) speech.create(signal.id); // G-02：dispatch 前创建；无 speech 不创建
    dispatcher.dispatch(signal);
  });

  const unsubRelease = arbiter.onRelease((id, reason) => {
    speech.onRelease(id, reason);
  });

  // P0-1 / D47：feedback.subscribe 是 compose 强制步骤
  const unsubFeedback = feedback.subscribe((fb) => {
    validateAt("L4.publishFeedback", { fb }, contract);
    if (fb.kind === "renderer_error") {
      consoleLogger.warn("renderer_error", { sourceId: fb.sourceId, error: fb.error });
      bus.publish({
        id: idFactory.next(),
        ts: clock.now(),
        type: "system.renderer_error",
        runtimeId: cfg.runtimeId,
        sourceId: "feedback",
        scope: "runtime",
        payload: { rendererId: fb.sourceId, error: fb.error },
      });
      return;
    }
    speech.onFeedback(fb);
    if (fb.kind === "audio_done") arbiter.notifyRelease(fb.signalId, "feedback_done");
    if (fb.kind === "interrupted") arbiter.notifyRelease(fb.signalId, "interrupted");
    if (fb.kind === "signal_error") arbiter.notifyRelease(fb.signalId, "feedback_error");
  });

  const tracking = createFrameChannel<TrackingFrame>({ dropIfBusy: true });
  const trackingSource: TrackingSource = {
    id: "tracking:default",
    contractVersion: TRACKING_CONTRACT_VERSION,
    channel: tracking,
  };
  const scheduler = createScheduler(clock, safety, contract);
  scheduler.attachTrackingSource(trackingSource);
  scheduler.setFusionStage(createDefaultFusionStage());

  const sampledValidator = new SampledValidator();
  const unsubFrame = scheduler.onFrame((f) => {
    // L35.emitFrame 只在 composition 的 scheduler.onFrame 回调内出现一次（A02 / P0-R1）
    sampledValidator.validate("L35.emitFrame", { frame: f }, contract);
    dispatcher.dispatchFrame(f);
  });

  const pipeline = createPipeline({
    memory: cfg.memory,
    cognition,
    sourceHub,
    aggregator: cfg.aggregator ?? createDefaultAggregator(),
    hooks,
    safety,
    contract,
    principal: llmPrincipal,
    arbiter,
    motion,
    clock,
    runtimeId: cfg.runtimeId,
    persona,
    memoryRecallTimeoutMs: cfg.memoryRecallTimeoutMs ?? 50,
    maxBatchOutputs: cfg.maxBatchOutputs ?? 64,
    batchTimeoutMs: cfg.batchTimeoutMs ?? 2000,
  });

  // Q5 桥接：InputBus → EventBus → pipeline.onEvent（桥接在 composition 完成）
  inputBus.onDelta((delta) => {
    bus.publish({
      id: idFactory.next(),
      ts: clock.now(),
      type: "input.delta",
      runtimeId: cfg.runtimeId,
      sourceId: "input-bus",
      scope: "runtime",
      payload: delta,
    });
  });

  const unsubBus = bus.subscribe(
    (e) => shouldReceive(e, cfg.runtimeId),
    (e) => {
      void pipeline.onEvent(e);
    },
  );

  return {
    pipeline,
    scheduler,
    registry,
    dispatcher,
    arbiter,
    speech,
    safety,
    tools,
    bus,
    sourceHub,
    hooks,
    ledger,
    inputBus,
    feedback,
    async dispose(): Promise<void> {
      const steps: Array<[string, () => void | Promise<void>]> = [
        ["unsubBus", unsubBus],
        ["unsubFrame", unsubFrame],
        ["unsubFeedback", unsubFeedback],
        ["hooks", () => hooks.dispose()],
        ["sourceHub", () => sourceHub.dispose()],
        ["dispatcher", () => dispatcher.dispose()],
        ["renderers", () => { for (const r of [...mounted].reverse()) r.dispose(); }],
        ["registry", () => registry.dispose()],
        ["arbiter", () => arbiter.dispose()],
        ["unsubDispatch", unsubDispatch],
        ["unsubRelease", unsubRelease],
        ["speech", () => speech.dispose()],
        ["feedback", () => feedback.dispose()],
        ["inputBus", () => inputBus.dispose()],
        ["tools", () => tools.dispose()],
        ["clock", () => clock.frameSource.stop()],
      ];
      if (ownsBus) steps.push(["bus", () => bus.dispose()]);

      const failures: Array<{ step: string; error: unknown }> = [];
      for (const [name, fn] of steps) {
        try {
          await fn();
        } catch (error) {
          failures.push({ step: name, error });
        }
      }
      if (failures.length === 1) throw failures[0]!.error;
      if (failures.length > 1) {
        throw new AggregateError(
          failures.map((f) => f.error),
          `dispose_failed:${failures.map((f) => f.step).join(",")}`,
        );
      }
    },
  };
}
