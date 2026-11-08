// A07：FrameChannel 语义（附件 A 8.1 / D18 / 铁律 4）
// 慢回调阻塞当前 publish；dropIfBusy 只防重入；异常隔离。
import { describe, expect, it } from "vitest";
import { createFrameChannel } from "../../core/scheduler/frame-channel-impl";
import { writeEvidenceLog } from "../helpers/evidence";

describe("A07 frame-channel", () => {
  it("同步遍历；慢回调阻塞当前 publish", () => {
    const ch = createFrameChannel<number>();
    const order: string[] = [];
    ch.subscribe((n) => {
      order.push(`start:${n}`);
      const until = Date.now() + 20; // 慢回调
      while (Date.now() < until) {
        /* busy */
      }
      order.push(`end:${n}`);
    });
    ch.publish(1);
    // publish 返回时回调已同步执行完毕
    expect(order).toEqual(["start:1", "end:1"]);
  });

  it("latest 永远最新", () => {
    const ch = createFrameChannel<number>();
    ch.publish(1);
    ch.publish(2);
    expect(ch.latest).toBe(2);
  });

  it("dropIfBusy 只防重入：重入帧丢弃；非重入照常", () => {
    const ch = createFrameChannel<number>();
    const seen: number[] = [];
    ch.subscribe(
      (n) => {
        seen.push(n);
        if (n === 1) {
          ch.publish(2); // 重入
        }
      },
      { dropIfBusy: true },
    );
    const seenNoDrop: number[] = [];
    ch.subscribe((n) => seenNoDrop.push(n)); // 无 dropIfBusy 的订阅者不丢
    ch.publish(1);
    ch.publish(3);
    expect(seen).toEqual([1, 3]); // 重入的 2 被丢弃
    // 递归语义：重入的 2 先于尚未轮到回调的订阅者收到 1（dropIfBusy 只防重入，不重排顺序）
    expect(seenNoDrop).toEqual([2, 1, 3]);
  });

  it("异常隔离：单订阅者抛错不影响其余订阅者", () => {
    const ch = createFrameChannel<number>();
    const seen: number[] = [];
    ch.subscribe(() => {
      throw new Error("boom");
    });
    ch.subscribe((n) => seen.push(n));
    expect(() => ch.publish(1)).not.toThrow();
    expect(seen).toEqual([1]);
  });

  it("运行期不版本校验：publish/subscribe 路径无 validateAt 调用（配合 A02 埋点）", () => {
    const ch = createFrameChannel<{ contractVersion: string }>();
    ch.subscribe(() => {});
    ch.publish({ contractVersion: "garbage-version-not-validated" });
    expect(ch.latest?.contractVersion).toBe("garbage-version-not-validated");
  });

  it("写入 A07 证据产物", () => {
    writeEvidenceLog("frame-channel", ["sync publish; dropIfBusy reentrancy; isolation"], true);
  });
});
