// Genesis-1 角色运行时骨架 · MockInternalDrive（任务书 7.7）
// 接口预留的 mock：tick 返回 null 或 idle_action；不实现真实离线自主生活逻辑。
import type { DriveIntent, DriveState, InternalDrive, RuntimeMode } from "../../core/contract/drive";

export interface MockInternalDriveOptions {
  id?: string;
  intent?: DriveIntent | null;
}

export function createMockInternalDrive(opts?: MockInternalDriveOptions): InternalDrive {
  let mode: RuntimeMode = "reactive";
  const intent = opts?.intent ?? null;

  return {
    id: opts?.id ?? "drive:mock",
    async tick(_now: number): Promise<DriveIntent | null> {
      return intent;
    },
    setMode(m: RuntimeMode): void {
      mode = m;
    },
    snapshot(): DriveState {
      return { mode, lastIntent: intent ?? undefined };
    },
  };
}
