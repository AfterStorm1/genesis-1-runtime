// 情绪偏向钩子：用户消息注入情绪注记；非用户消息原样放行（值级扩展测试）
import { describe, expect, it } from "vitest";
import { createEmotionStateMachine } from "../../adapters/drive/emotion-state-machine";
import { createEmotionBiasHook } from "../../adapters/drive/emotion-bias-hook";
import type { CognitionInput } from "../../core/contract/cognition";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import { samplePersona } from "../helpers/fixtures";
import { writeEvidenceLog } from "../helpers/evidence";

const persona = samplePersona("蕙");

function userMsg(text: string): CognitionInput {
  return { contractVersion: COGNITION_CONTRACT_VERSION, kind: "user_message", text, persona };
}

describe("emotion bias hook", () => {
  it("user_message 注入情绪注记（角色名 + 情绪 + 强度），原文本保留", () => {
    const machine = createEmotionStateMachine();
    machine.applyEvent({ type: "praise", magnitude: 1 });
    const hook = createEmotionBiasHook(machine, { label: "蕙" });
    const out = hook.process(userMsg("在吗"), {} as never) as Extract<CognitionInput, { kind: "user_message" }>;
    expect(out.text).toContain("系统注记");
    expect(out.text).toContain("蕙");
    expect(out.text).toContain("happy");
    expect(out.text).toContain("在吗");
  });

  it("非 user_message 输入原样放行（不注入）", () => {
    const machine = createEmotionStateMachine();
    const hook = createEmotionBiasHook(machine);
    const perception = {
      contractVersion: COGNITION_CONTRACT_VERSION,
      kind: "perception",
      snapshot: { contractVersion: "1.0.0", ts: 1, entities: [] },
      persona,
    } as CognitionInput;
    expect(hook.process(perception, {} as never)).toBe(perception);
  });

  it("写入 emotion-bias-hook 证据产物", () => {
    writeEvidenceLog("emotion-bias-hook.test", ["note injection; passthrough non-user"], true);
  });
});
