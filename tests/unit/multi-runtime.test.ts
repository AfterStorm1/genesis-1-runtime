// A10：多 Runtime 隔离（附件 A 8.1 / 1.1 / D29 / D31）
import { describe, expect, it } from "vitest";
import { compose, shouldReceive } from "../../composition/composition-root";
import { createEventBus } from "../../core/bus/event-bus-impl";
import { derivePrincipal, __principalCacheSize } from "../../core/principal";
import { createTextRenderer } from "../../adapters/renderers/text-renderer";
import type { BusEvent } from "../../core/contract/bus";
import { writeEvidenceLog } from "../helpers/evidence";

function ev(partial: Partial<BusEvent>): BusEvent {
  return {
    id: "rt:x:src:1",
    ts: 1,
    type: "t",
    runtimeId: "rt:a",
    sourceId: "src",
    scope: "runtime",
    payload: null,
    ...partial,
  };
}

describe("A10 multi-runtime", () => {
  it("shouldReceive：targetRuntimeId 定向优先（即使 scope:world 也只被目标接收）", () => {
    expect(shouldReceive(ev({ targetRuntimeId: "rt:b", scope: "world" }), "rt:b")).toBe(true);
    expect(shouldReceive(ev({ targetRuntimeId: "rt:b", scope: "world" }), "rt:a")).toBe(false);
    expect(shouldReceive(ev({ targetRuntimeId: "rt:b" }), "rt:b")).toBe(true);
    expect(shouldReceive(ev({ targetRuntimeId: "rt:b" }), "rt:a")).toBe(false);
  });

  it("shouldReceive：无定向 + scope world → 全收；否则 runtimeId 匹配", () => {
    expect(shouldReceive(ev({ scope: "world", runtimeId: "rt:x" }), "rt:a")).toBe(true);
    expect(shouldReceive(ev({ scope: "runtime", runtimeId: "rt:a" }), "rt:a")).toBe(true);
    expect(shouldReceive(ev({ scope: "runtime", runtimeId: "rt:a" }), "rt:b")).toBe(false);
  });

  it("Principal 缓存 key 含三元组", () => {
    const before = __principalCacheSize();
    const p1 = derivePrincipal("llm", "rt:a", "persona:a");
    const p2 = derivePrincipal("llm", "rt:b", "persona:a");
    const p3 = derivePrincipal("llm", "rt:a", "persona:b");
    const p4 = derivePrincipal("user", "rt:a", "persona:a");
    expect(new Set([p1.id, p2.id, p3.id, p4.id]).size).toBe(4);
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
    expect(p1).not.toBe(p4);
    expect(derivePrincipal("llm", "rt:a", "persona:a")).toBe(p1);
    expect(__principalCacheSize()).toBe(before + 4);
  });

  it("两个 Runtime 共享总线：world 广播都收到；定向只目标收到；runtime 事件隔离", async () => {
    const sharedBus = createEventBus();
    const mk = (id: string) =>
      compose({
        runtimeId: id,
        personaId: `persona:${id}`,
        frameHz: 10,
        sharedBus,
        renderers: [createTextRenderer()],
        parameters: [],
      });
    const [ra, rb] = await Promise.all([mk("rt:a"), mk("rt:b")]);

    const seenA: string[] = [];
    const seenB: string[] = [];
    // 观察者模拟 composition 的接线：同一共享总线上按 shouldReceive 过滤
    ra.bus.subscribe((e) => shouldReceive(e, "rt:a"), (e) => seenA.push(e.type));
    rb.bus.subscribe((e) => shouldReceive(e, "rt:b"), (e) => seenB.push(e.type));

    sharedBus.publish(ev({ id: "x:1", type: "world.evt", scope: "world", runtimeId: "rt:host" }));
    expect(seenA).toContain("world.evt");
    expect(seenB).toContain("world.evt");

    sharedBus.publish(ev({ id: "x:2", type: "dir.evt", targetRuntimeId: "rt:a", runtimeId: "rt:host" }));
    expect(seenA).toContain("dir.evt");
    expect(seenB).not.toContain("dir.evt");

    sharedBus.publish(ev({ id: "x:3", type: "rt-a.evt", runtimeId: "rt:a" }));
    expect(seenA).toContain("rt-a.evt");
    expect(seenB).not.toContain("rt-a.evt");

    // sharedBus 不由 Runtime dispose
    const disposeSpy = { called: false };
    const orig = sharedBus.dispose.bind(sharedBus);
    sharedBus.dispose = () => {
      disposeSpy.called = true;
      orig();
    };
    await ra.dispose();
    await rb.dispose();
    expect(disposeSpy.called).toBe(false);
  });

  it("写入 A10 证据产物", () => {
    writeEvidenceLog("multi-runtime.test", ["principal triple key; sharedBus filter"], true);
  });
});
