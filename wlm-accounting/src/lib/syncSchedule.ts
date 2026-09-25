// When to sync, so that nobody has to think about syncing.
//
// Four reasons to reach for the server, and they are not the same reason:
//
//   opened     the books on screen should not be yesterday's
//   changed    what was just captured should reach the other device
//   waited     the other device's work should arrive without being asked for
//   returned   coming back to a window that sat untouched for an hour
//
// The rules are here, apart from React and apart from any platform, because
// "did it sync when it should have" is a question worth being able to answer in
// a test rather than by watching a phone.

export type SyncReason = "opened" | "changed" | "waited" | "returned";

export interface SyncScheduleOptions {
  /** How long to wait after a change before pushing it. */
  debounceMs?: number;
  /** How often to look for the other device's work. */
  intervalMs?: number;
  /** How long a window must have been idle for returning to it to count. */
  staleMs?: number;
  /** Longest gap between retries once the server can't be reached. */
  maxBackoffMs?: number;
}

const DEFAULTS = {
  // Long enough to gather a burst of edits into one exchange, short enough that
  // walking to the other machine and looking is not faster.
  debounceMs: 4_000,
  intervalMs: 60_000,
  staleMs: 30_000,
  // A tunnel that is down stays down for minutes, not seconds. Hammering it
  // changes nothing except the battery.
  maxBackoffMs: 5 * 60_000,
};

export interface SyncAttempt {
  reason: SyncReason;
  at: number;
}

/**
 * Decides when the next attempt is due. It holds no timers of its own — the
 * caller drives it — so its behaviour is entirely determined by what it is told
 * and can be checked without waiting for real time to pass.
 */
export class SyncSchedule {
  private readonly options: Required<SyncScheduleOptions>;
  private pendingChangeAt: number | null = null;
  private lastAttemptAt = 0;
  private startedAt = 0;
  private lastSuccessAt = 0;
  private consecutiveFailures = 0;
  private running = false;

  constructor(options: SyncScheduleOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Something was written locally. */
  noteChange(now: number): void {
    if (this.pendingChangeAt === null) this.pendingChangeAt = now;
  }

  noteStarted(now: number): void {
    this.running = true;
    this.lastAttemptAt = now;
    this.startedAt = now;
  }

  noteFinished(now: number, ok: boolean): void {
    this.running = false;
    if (ok) {
      this.consecutiveFailures = 0;
      this.lastSuccessAt = now;
      // Only what was pending when the exchange began is covered by it. Work
      // captured while the request was in flight still needs sending, and the
      // client's push cursor — taken before the request for the same reason —
      // will include it next time.
      if (this.pendingChangeAt !== null && this.pendingChangeAt < this.startedAt) {
        this.pendingChangeAt = null;
      }
    } else {
      this.consecutiveFailures++;
    }
  }

  /** Doubling backoff, so a server that is down is asked about less and less. */
  backoffMs(): number {
    if (this.consecutiveFailures === 0) return 0;
    const doubled = this.options.debounceMs * 2 ** (this.consecutiveFailures - 1);
    return Math.min(doubled, this.options.maxBackoffMs);
  }

  /**
   * The reason to sync right now, or null. Checked on a tick; the caller does
   * not need to know which of the four applies, only whether one does.
   */
  due(now: number, opened = false): SyncReason | null {
    if (this.running) return null;

    const waitingOnBackoff = now - this.lastAttemptAt < this.backoffMs();
    if (waitingOnBackoff) return null;

    if (opened && this.lastAttemptAt === 0) return "opened";

    if (this.pendingChangeAt !== null && now - this.pendingChangeAt >= this.options.debounceMs) {
      return "changed";
    }

    if (now - this.lastSuccessAt >= this.options.intervalMs) return "waited";

    return null;
  }

  /**
   * Coming back to the window. Worth a sync only if it has been sitting a
   * while — alt-tabbing between two windows is not news from the other device.
   */
  onReturn(now: number): SyncReason | null {
    if (this.running) return null;
    if (now - this.lastSuccessAt < this.options.staleMs) return null;
    if (now - this.lastAttemptAt < this.backoffMs()) return null;
    return "returned";
  }

  get hasUnsentWork(): boolean {
    return this.pendingChangeAt !== null;
  }

  get failing(): boolean {
    return this.consecutiveFailures > 0;
  }

  get failures(): number {
    return this.consecutiveFailures;
  }
}
