// Genesis-1 角色运行时骨架 · RendererRegistry 实现（附件 A 3.3 / G-03）
import type { RendererRegistry } from "../contract/dispatch";
import type { Renderer } from "../contract/renderer";
import type { FrameCapability } from "../contract/frame-capability";

export function createRendererRegistry(): RendererRegistry {
  const renderers: Renderer[] = [];
  const frameCaps = new Map<string, FrameCapability>();

  return {
    register(renderer: Renderer): void {
      // 成功 mount 后才 register；registry 内不做 mount（G-03）
      renderers.push(renderer);
    },
    registerFrameCapability(cap: FrameCapability): void {
      frameCaps.set(cap.id, cap); // 落表（P1-R6 / D51）
    },
    list(): Renderer[] {
      return [...renderers];
    },
    dispose(): void {
      renderers.length = 0;
      frameCaps.clear();
    },
  };
}
