// Genesis-1 角色运行时骨架 · ExpressionSourceHub 实现（附件 A 5.1 / P0-5 / D34 / E-1）
// 只承载额外 source；默认 aggregator 由 l3Tick 直接调用，不注册为 Hub source。
// 不持有 arbiter / dispatcher 引用。空 Hub 常数开销。
import type { ExpressionSource, ExpressionSourceEmitContext, ExpressionSourceHub } from "../contract/expression-source";
import type { ExpressionSignal } from "../contract/expression";
import type { ContractRegistry } from "../contract/versioning";
import { validateAt } from "../contract/entry-points";

export function createExpressionSourceHub(contract: ContractRegistry): ExpressionSourceHub {
  const sources = new Map<string, ExpressionSource>();

  return {
    register(source: ExpressionSource): void {
      // 内部校验（附录 C：hub-impl register → ExpressionSource.register）
      validateAt("ExpressionSource.register", { source }, contract);
      if (sources.has(source.id)) {
        throw new Error(`source_already_registered:${source.id}`);
      }
      sources.set(source.id, source);
    },
    unregister(id: string): void {
      sources.delete(id);
    },
    flush(ctx: ExpressionSourceEmitContext): ExpressionSignal[] {
      const out: ExpressionSignal[] = [];
      for (const source of sources.values()) {
        // flush 内对每个 source 校验（附录 C：hub-impl flush → ExpressionSource.emit）
        validateAt("ExpressionSource.emit", { source }, contract);
        out.push(...source.emit(ctx));
      }
      return out;
    },
    list(): ExpressionSource[] {
      return [...sources.values()];
    },
    dispose(): void {
      sources.clear();
    },
  };
}
