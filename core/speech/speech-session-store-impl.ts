// Genesis-1 角色运行时骨架 · SpeechSessionStore 实现（附件 A 3.4 / 3.4.1 / S-04 / D25 / D41）
// CAS 同步、先到先赢、终态幂等、requested→playing 允许、映射表写死、dispose 兜底 failed(cancelled)。
import type { ReleaseReason } from "../contract/arbitration";
import type { RendererFeedback } from "../contract/feedback";
import type { SpeechSession, SpeechSessionStore, SpeechState } from "../contract/speech";

export const TRANSITIONS: Record<SpeechState, SpeechState[]> = {
  requested: ["synthesizing", "playing", "failed", "interrupted"],
  synthesizing: ["playing", "failed", "interrupted"],
  playing: ["done", "interrupted", "failed"],
  done: [],
  interrupted: [],
  failed: [],
};

const TERMINAL: ReadonlySet<SpeechState> = new Set(["done", "interrupted", "failed"]);

/** 终态集合外的「非终态」：requested / synthesizing / playing */
const NON_TERMINAL: SpeechState[] = ["requested", "synthesizing", "playing"];

// releaseReason → 会话状态映射（minimal per handbook; confirm —— 手册只写死 feedback 映射表；
// arbiter release 侧映射为骨架最小约定，列于待确认清单）
const RELEASE_STATE: Record<ReleaseReason, SpeechState> = {
  completed: "done",
  feedback_done: "done",
  feedback_error: "failed",
  interrupted: "interrupted",
  cancelled: "interrupted",
  timeout: "interrupted",
  watchdog: "interrupted",
  rate_limited: "interrupted",
  superseded: "interrupted",
};

export function createSpeechSessionStore(): SpeechSessionStore {
  const sessions = new Map<string, SpeechSession>();

  function now(): number {
    return Date.now();
  }

  function cas(
    signalId: string,
    fromStates: SpeechState[],
    to: SpeechState,
    patch?: Partial<SpeechSession>,
  ): boolean {
    const s = sessions.get(signalId);
    if (!s) return false;
    if (!fromStates.includes(s.state)) return false; // 先到先赢；终态幂等忽略
    Object.assign(s, patch, { state: to, updatedAt: now() });
    return true;
  }

  return {
    get(signalId: string): SpeechSession | undefined {
      return sessions.get(signalId);
    },
    create(signalId: string): SpeechSession {
      const existing = sessions.get(signalId);
      if (existing) return existing; // 幂等（P1-1 / D35）
      const s: SpeechSession = {
        signalId,
        state: "requested",
        startedAt: now(),
        updatedAt: now(),
      };
      sessions.set(signalId, s);
      return s;
    },
    transition(signalId: string, to: SpeechState, patch?: Partial<SpeechSession>): void {
      const s = sessions.get(signalId);
      if (!s) return;
      if (!TRANSITIONS[s.state].includes(to)) return;
      Object.assign(s, patch, { state: to, updatedAt: now() });
    },
    casTransition(signalId: string, fromStates: SpeechState[], to: SpeechState, patch?: Partial<SpeechSession>): boolean {
      return cas(signalId, fromStates, to, patch);
    },
    onFeedback(fb: RendererFeedback): void {
      if (fb.kind === "renderer_error") return; // 只记 logger + bus，不改 session（P1-6 / D50）
      if (fb.signalId === undefined) return;
      if (!sessions.has(fb.signalId)) return;
      switch (fb.kind) {
        case "viseme_ready": {
          const s = sessions.get(fb.signalId)!;
          if (s.state === "requested" || s.state === "synthesizing" || s.state === "playing") {
            s.visemeTimeline = fb.visemeTimeline; // 状态不变，只写 visemeTimeline
          }
          // done / interrupted / failed → 幂等丢弃（interrupted 后到达的 viseme_ready 丢弃）
          return;
        }
        case "audio_started": {
          // 允许 requested → playing（S-04 / D41）
          cas(fb.signalId, ["requested", "synthesizing"], "playing", {
            audioRef: fb.audioRef,
            startedAt: now(),
          });
          return;
        }
        case "audio_done": {
          cas(fb.signalId, ["playing"], "done", { releaseReason: "feedback_done" });
          return;
        }
        case "interrupted": {
          cas(fb.signalId, NON_TERMINAL, "interrupted", { releaseReason: "interrupted" });
          return;
        }
        case "signal_error": {
          cas(fb.signalId, NON_TERMINAL, "failed", { releaseReason: "feedback_error", error: fb.error });
          return;
        }
      }
    },
    onRelease(signalId: string, reason: ReleaseReason): void {
      const target = RELEASE_STATE[reason];
      if (target === undefined) return;
      cas(signalId, NON_TERMINAL, target, { releaseReason: reason });
    },
    dispose(): void {
      for (const s of sessions.values()) {
        if (TERMINAL.has(s.state)) continue;
        Object.assign(s, {
          state: "failed" as SpeechState,
          releaseReason: "cancelled" as ReleaseReason,
          updatedAt: now(),
        });
      }
    },
  };
}
