// Genesis-1 角色运行时骨架 · PipelineHookChain 实现（附件 A 5.2 / D27）
// 空表 run 直接返回 payload，无分配（A12 常数开销）。
// register 期版本校验由 composition 完成（VALIDATE_AT：PipelineHook.register 可达=composition）。
import type { HookContext, Logger, PipelineHook, PipelineHookChain, PipelineStage } from "../contract/pipeline-hook";
import type { Clock } from "../contract/clock";
import type { ContractRegistry } from "../contract/versioning";

export function createPipelineHookChain(contract: ContractRegistry, clock: Clock, logger: Logger): PipelineHookChain {
  const hooks: PipelineHook[] = [];

  const hookCtx: HookContext = {
    clock,
    logger,
    contract: {
      versionOf: (k) => contract.versionOf(k),
      supports: (r) => contract.supports(r),
      validate: (k, a) => contract.validate(k, a),
    },
  };

  return {
    register(hook: PipelineHook): void {
      if (hooks.some((h) => h.id === hook.id)) {
        throw new Error(`hook_already_registered:${hook.id}`);
      }
      hooks.push(hook);
    },
    unregister(id: string): void {
      const idx = hooks.findIndex((h) => h.id === id);
      if (idx >= 0) hooks.splice(idx, 1);
    },
    async run<T>(stage: PipelineStage, payload: T): Promise<T | null> {
      if (hooks.length === 0) return payload; // 空表：直接返回 payload（常数开销）
      let cur: T | null = payload;
      for (const hook of hooks) {
        if (hook.stage !== stage) continue;
        cur = await hook.process(cur as T, hookCtx);
        if (cur === null) return null;
      }
      return cur;
    },
    list(): PipelineHook[] {
      return [...hooks];
    },
    dispose(): void {
      for (const hook of hooks) {
        try {
          hook.dispose?.();
        } catch (err) {
          // 异常隔离；dispose 失败由 composition 的步骤聚合捕获不了此处 → 冒泡交给调用方
          throw err;
        }
      }
      hooks.length = 0;
    },
  };
}
