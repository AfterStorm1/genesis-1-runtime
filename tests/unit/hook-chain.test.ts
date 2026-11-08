// PipelineHookChain：空表直接返回 payload；最小权限 HookContext（附件 A 5.2 / D27）
import { describe, expect, it } from "vitest";
import { createPipelineHookChain } from "../../core/hook-chain/hook-chain-impl";
import { createContractRegistry } from "../../core/migrate/contract-registry-impl";
import { createFakeClock } from "../helpers/fixtures";
import type { PipelineHook, Logger } from "../../core/contract/pipeline-hook";
import { PIPELINE_HOOK_CONTRACT_VERSION } from "../../core/contract/pipeline-hook";
import { writeEvidenceLog } from "../helpers/evidence";

const contract = createContractRegistry();
const clock = createFakeClock();
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function hook(id: string, stage: PipelineHook["stage"], fn: (p: unknown) => unknown): PipelineHook {
  return {
    id,
    contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
    stage,
    process: (p) => fn(p) as never,
  };
}

describe("hook chain", () => {
  it("空表 run 直接返回 payload（同引用，无分配）", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    const payload = { x: 1 };
    const out = await chain.run("beforeCognition", payload);
    expect(out).toBe(payload);
  });

  it("按 stage 过滤执行；返回 null 中止", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    const order: string[] = [];
    chain.register(
      hook("h1", "beforeCognition", (p) => {
        order.push("h1");
        return p;
      }),
    );
    chain.register(
      hook("h2", "afterCognition", (p) => {
        order.push("h2");
        return p;
      }),
    );
    const out = await chain.run("beforeCognition", { a: 1 });
    expect(order).toEqual(["h1"]);
    expect(out).toEqual({ a: 1 });

    const nuller = createPipelineHookChain(contract, clock, logger);
    nuller.register(hook("n", "beforeCognition", () => null));
    expect(await nuller.run("beforeCognition", {})).toBeNull();
  });

  it("HookContext 只读能力：不暴露 arbiter/dispatcher/safety/tool/sourceHub/feedback", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    let captured: unknown;
    chain.register({
      id: "probe",
      contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
      stage: "beforeCognition",
      process(p, ctx) {
        captured = ctx;
        return p;
      },
    });
    await chain.run("beforeCognition", {});
    const ctx = captured as { clock: unknown; logger: unknown; contract: Record<string, unknown> };
    expect(ctx.clock).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(typeof ctx.contract.versionOf).toBe("function");
    expect(typeof ctx.contract.supports).toBe("function");
    expect(typeof ctx.contract.validate).toBe("function");
    for (const forbidden of ["arbiter", "dispatcher", "safety", "tool", "sourceHub", "feedback"]) {
      expect((ctx as unknown as Record<string, unknown>)[forbidden], forbidden).toBeUndefined();
    }
  });

  it("unregister / list / dispose 调用 hook.dispose", async () => {
    const chain = createPipelineHookChain(contract, clock, logger);
    let disposed = false;
    chain.register({
      id: "h",
      contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
      stage: "beforeCognition",
      process: (p) => p,
      dispose: () => {
        disposed = true;
      },
    });
    expect(chain.list()).toHaveLength(1);
    chain.unregister("h");
    expect(chain.list()).toHaveLength(0);
    chain.register({
      id: "h2",
      contractVersion: PIPELINE_HOOK_CONTRACT_VERSION,
      stage: "beforeCognition",
      process: (p) => p,
      dispose: () => {
        disposed = true;
      },
    });
    chain.dispose();
    expect(disposed).toBe(true);
    expect(chain.list()).toHaveLength(0);
  });

  it("写入 hook-chain 证据产物", () => {
    writeEvidenceLog("hook-chain.test", ["empty chain constant; minimal read-only context"], true);
  });
});
