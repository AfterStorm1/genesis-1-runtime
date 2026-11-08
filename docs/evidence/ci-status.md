# CI 状态记录

- 仓库：`https://github.com/Afterstorm1/genesis-1-runtime`
- Workflow：`.github/workflows/ci.yml`（5 jobs：typecheck / test / test-e2e / scan / bench）
- 结果：**全绿（pass）** —— 2026-11-08（北京时间），触发提交 `2d2f6c0`（ci: drop pnpm cache hint）
- 命令与本地 verify.cmd 一致：`pnpm install --no-frozen-lockfile` + typecheck/test/test:e2e/scan:validate-at/scan:payload-shape/bench:slots/bench:frame-channel
- 结论：A01a–A17 证据矩阵在本地（local pass）与 GitHub Actions（CI pass）双重通过。
  仍需注意：本记录是「内部受控测试候选」级别的证据；**不是 v1.0.0 发布声明**，
  不承诺生产安全、跨进程总线、真实适配器行为与硬件级安全（手册 8.4/8.5 范围限制）。

复验方式：向 main 分支 push 任意提交，或在 Actions 页手动 re-run。
