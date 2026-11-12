/** Local monotonic clock for one work rail. Events seed history once; they never drive live ticks. */
export class WorkElapsedClock {
  private accumulated: number;
  private resumedAt: number | null = null;

  constructor(initialElapsedMs = 0) {
    this.accumulated = Math.max(0, Number.isFinite(initialElapsedMs) ? initialElapsedMs : 0);
  }

  setRunning(running: boolean, now = performance.now()): void {
    this.accumulated = this.elapsed(now);
    this.resumedAt = running ? now : null;
  }

  elapsed(now = performance.now()): number {
    return this.accumulated + (this.resumedAt === null ? 0 : Math.max(0, now - this.resumedAt));
  }
}
