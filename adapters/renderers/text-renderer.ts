// Genesis-1 角色运行时骨架 · TextRenderer 最小实现（任务书 6.3）
// apply 记录/打印；不实现真实文本渲染行为保证。
import type { Renderer } from "../../core/contract/renderer";
import type { ExpressionSignal } from "../../core/contract/expression";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";

export interface TextRenderer extends Renderer {
  readonly applied: ExpressionSignal[];
}

export function createTextRenderer(opts?: { id?: string }): TextRenderer {
  const applied: ExpressionSignal[] = [];
  return {
    id: opts?.id ?? "renderer:text",
    capabilities: {
      modalities: ["text"],
      consumesFrames: false,
      supportsInterruption: true,
      contractRanges: {
        expression: { min: EXPRESSION_CONTRACT_VERSION, max: EXPRESSION_CONTRACT_VERSION },
      },
    },
    applied,
    async mount(): Promise<void> {
      // 最小实现：无资源
    },
    apply(signal: ExpressionSignal): void {
      applied.push(signal);
      // eslint-disable-next-line no-console
      console.log(`[renderer:text] ${signal.id} emotion=${signal.emotion.emotion} priority=${signal.priority}`);
    },
    dispose(): void {
      // 最小实现：无资源
    },
  };
}
