# adapters/actuator

执行器适配器空壳目录（任务书 2.1：空壳 VRChat/Actuator Renderer）。

- 体感/执行器最小链路：`EmptyTrackingSource → Scheduler → FrameChannel<ActuatorFrame> → 执行器 Renderer`。
- VRChat 空壳见 `adapters/renderers/empty-vrchat-renderer.ts`。
- 不承诺第三方适配器真实行为；真实 OSC / 体感硬件不在骨架交付范围。
