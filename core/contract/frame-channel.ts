// Genesis-1 角色运行时骨架 · 契约（附件 A 3.4）
export interface FrameChannel<T> {
  /** 同步遍历；订阅者必须入队即返；慢回调阻塞当前 publish */
  publish(frame: T): void;
  subscribe(cb: (frame: T) => void, opts?: { dropIfBusy?: boolean }): () => void;
  readonly latest: T | undefined;
}
