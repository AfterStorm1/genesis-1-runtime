// Genesis-1 角色运行时骨架 · EmptyVRChatRenderer 空壳（任务书 6.3 / 7.7）
// consumesFrames:true；applyFrame 空实现；声明 supportedParameters / contractRanges。
// 不真实发 OSC，不承诺 VRChat 适配器行为。
import type { Renderer } from "../../core/contract/renderer";
import { EXPRESSION_CONTRACT_VERSION } from "../../core/contract/expression";
import { ACTUATOR_CONTRACT_VERSION } from "../../core/contract/spatial";

export function createEmptyVRChatRenderer(): Renderer {
  return {
    id: "renderer:vrchat:empty",
    capabilities: {
      modalities: ["world"],
      consumesFrames: true,
      expectedFrameRate: 10,
      supportsInterruption: false,
      supportedParameters: ["VRCEmote", "Viseme", "Blink"],
      contractRanges: {
        expression: { min: EXPRESSION_CONTRACT_VERSION, max: EXPRESSION_CONTRACT_VERSION },
        actuatorFrame: { min: ACTUATOR_CONTRACT_VERSION, max: ACTUATOR_CONTRACT_VERSION },
      },
    },
    async mount(): Promise<void> {
      // 空壳：不建立 OSC 连接
    },
    apply(): void {
      // 空壳：不消费信号
    },
    applyFrame(): void {
      // 空壳：消费帧但不发 OSC
    },
    dispose(): void {
      // 空壳
    },
  };
}
