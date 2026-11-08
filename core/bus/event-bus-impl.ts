// Genesis-1 角色运行时骨架 · EventBus 实现（附件 A 1.1 / 3.9）
import type { BusEvent, EventBus } from "../contract/bus";

export function createEventBus(): EventBus {
  const subs = new Set<{ filter: (e: BusEvent) => boolean; handler: (e: BusEvent) => void }>();

  return {
    publish(e: BusEvent): void {
      for (const s of [...subs]) {
        try {
          if (s.filter(e)) s.handler(e);
        } catch (err) {
          // 异常隔离：单订阅者失败不影响其余订阅者（骨架行为）
          // eslint-disable-next-line no-console
          console.error("[event-bus] handler error", err);
        }
      }
    },
    subscribe(filter: (e: BusEvent) => boolean, handler: (e: BusEvent) => void): () => void {
      const sub = { filter, handler };
      subs.add(sub);
      return () => {
        subs.delete(sub);
      };
    },
    dispose(): void {
      subs.clear();
    },
  };
}
