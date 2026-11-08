// A04：SanitizedText 严格模式（附件 A 8.1 / S-06 / D43）
import { describe, expect, it } from "vitest";
import { SANITIZED_TEXT_SYMBOL, isSanitizedText, markSanitized } from "../../core/contract/speech";
import { writeEvidenceLog } from "../helpers/evidence";

describe("A04 SanitizedText", () => {
  it("sanitize 产物通过严格校验", () => {
    const t = markSanitized("hello");
    expect(isSanitizedText(t)).toBe(true);
    expect(t.text).toBe("hello");
    expect(Object.isFrozen(t)).toBe(true);
    expect((t as unknown as Record<symbol, unknown>)[SANITIZED_TEXT_SYMBOL]).toBe(true);
  });

  it("非 branded 拒绝：普通对象 / 字符串 / null", () => {
    expect(isSanitizedText({ text: "hello" })).toBe(false);
    expect(isSanitizedText("hello")).toBe(false);
    expect(isSanitizedText(null)).toBe(false);
    expect(isSanitizedText(undefined)).toBe(false);
    expect(isSanitizedText({ text: 123, [SANITIZED_TEXT_SYMBOL]: true })).toBe(false); // text 非 string
  });

  it("JSON 往返后 brand 丢失（Symbol key 不参与序列化）", () => {
    const t = markSanitized("hello");
    const roundtrip = JSON.parse(JSON.stringify(t)) as unknown;
    expect(isSanitizedText(roundtrip)).toBe(false);
  });

  it("伪造 brand 对象：WeakSet miss → false（S-06）", () => {
    const forged = { text: "hello", [SANITIZED_TEXT_SYMBOL]: true };
    expect((forged as Record<symbol, unknown>)[SANITIZED_TEXT_SYMBOL]).toBe(true); // brand 位存在
    expect(isSanitizedText(forged)).toBe(false); // 但不在 WeakSet → 拒绝
  });

  it("跨 realm 必须重新 sanitize（模拟：新对象 + brand 不通过；重新 markSanitized 后通过）", () => {
    const t = markSanitized("hi");
    const clone = { ...t }; // brand 符号复制（浅拷贝保留 symbol key），但非 WeakSet 成员
    expect(isSanitizedText(clone)).toBe(false);
    const resanitized = markSanitized(clone.text);
    expect(isSanitizedText(resanitized)).toBe(true);
  });

  it("写入 A04 证据产物", () => {
    writeEvidenceLog("sanitize.test", ["strict brand; JSON loses brand; WeakSet miss rejects"], true);
  });
});
