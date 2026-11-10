// 终止互动钩子：最高优先级安全规则（值级扩展测试）
import { describe, expect, it } from "vitest";
import { createTerminationHook } from "../../adapters/safety-guard/termination-hook";
import type { TerminationHook } from "../../adapters/safety-guard/termination-hook";
import { COGNITION_CONTRACT_VERSION } from "../../core/contract/cognition";
import type { CognitionInput } from "../../core/contract/cognition";
import { samplePersona } from "../helpers/fixtures";
import { writeEvidenceLog } from "../helpers/evidence";

const persona = samplePersona("蕙");

function userMsg(text: string): CognitionInput {
  return { contractVersion: COGNITION_CONTRACT_VERSION, kind: "user_message", text, persona };
}

/** 测试助手：契约里 process(payload, ctx) 为两参，此处只关心 payload */
function run(hook: TerminationHook, input: CognitionInput): CognitionInput | null {
  return (hook.process as (payload: CognitionInput) => CognitionInput | null)(input);
}

describe("termination hook", () => {
  it("越界输入 → 阻断本轮（返回 null）并进入永久终止状态", () => {
    const guard = createTerminationHook();
    expect(guard.terminated).toBe(false);
    expect(run(guard, userMsg("你真是个傻逼"))).toBeNull();
    expect(guard.terminated).toBe(true);
    expect(guard.matchedPattern).toBe("傻逼");
  });

  it("终止后任何输入都不再回应（返回 null），包括正常输入", () => {
    const guard = createTerminationHook();
    run(guard, userMsg("垃圾"));
    expect(run(guard, userMsg("对不起，我们好好聊"))).toBeNull();
    expect(guard.terminated).toBe(true);
  });

  it("正常输入与系统消息不阻断", () => {
    const guard = createTerminationHook();
    expect(run(guard, userMsg("坐吧"))).not.toBeNull();
    expect(
      run(guard, {
        contractVersion: COGNITION_CONTRACT_VERSION,
        kind: "perception",
        snapshot: { contractVersion: "1.0.0", ts: 1, entities: [] },
        persona,
      }),
    ).not.toBeNull();
    expect(guard.terminated).toBe(false);
  });

  it("自定义词表生效；判定不区分大小写（英文）", () => {
    const guard = createTerminationHook({ bannedPatterns: ["自定义禁词", "Fuck"] });
    expect(run(guard, userMsg("说了句自定义禁词"))).toBeNull();
    const guard2 = createTerminationHook({ bannedPatterns: ["Fuck"] });
    expect(run(guard2, userMsg("fuck you"))).toBeNull();
  });

  it("写入 termination-hook 证据产物", () => {
    writeEvidenceLog("termination-hook.test", ["block on banned input; permanent state; case-insensitive"], true);
  });
});
