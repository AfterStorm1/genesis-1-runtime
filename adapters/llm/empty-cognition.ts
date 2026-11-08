// Genesis-1 角色运行时骨架 · 空壳认知适配器（任务书 6.3 / 7.7）
// 不实现真实 LLM；onInput 返回空 AsyncIterable。
import type { Cognition } from "../../core/contract/cognition";

export function createEmptyCognition(id = "cognition:empty"): Cognition {
  return {
    id,
    async mount(): Promise<void> {
      // 空壳
    },
    onInput(): AsyncIterable<never> {
      return (async function* () {
        /* 空 */
      })();
    },
    dispose(): void {
      // 空壳
    },
  };
}
