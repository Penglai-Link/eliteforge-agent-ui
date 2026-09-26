export type AssistantReplyEffect = "off" | "typewriter";

export const defaultAssistantReplySpeed = 120;
export const minAssistantReplySpeed = 30;
export const maxAssistantReplySpeed = 240;

export function normalizeAssistantReplySpeed(speed: number) {
  if (!Number.isFinite(speed)) return defaultAssistantReplySpeed;
  return Math.min(maxAssistantReplySpeed, Math.max(minAssistantReplySpeed, speed));
}

/** Paces assistant text deltas for presentation without changing the transport. */
export class AssistantReplyQueue {
  private messageCode: string | null = null;
  private characters: string[] = [];
  private frame: number | null = null;
  private lastFrameAt = 0;
  private carry = 0;
  private readonly drainWaiters = new Map<string, Array<() => void>>();

  constructor(
    private readonly appendText: (messageCode: string, text: string) => void,
    private readonly getSpeed: () => number = () => defaultAssistantReplySpeed,
  ) {}

  enqueue(
    messageCode: string,
    text: string,
    effect: AssistantReplyEffect = "off",
  ) {
    if (!text) return;
    if (effect === "off") {
      this.flush();
      this.appendText(messageCode, text);
      return;
    }
    if (this.messageCode && this.messageCode !== messageCode) this.flush();
    this.messageCode = messageCode;
    this.characters.push(...Array.from(text));
    this.schedule();
  }

  waitForDrain(messageCode: string) {
    if (this.messageCode !== messageCode || !this.characters.length) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const waiters = this.drainWaiters.get(messageCode) ?? [];
      waiters.push(resolve);
      this.drainWaiters.set(messageCode, waiters);
    });
  }

  flush(messageCode?: string) {
    if (!this.messageCode || (messageCode && this.messageCode !== messageCode)) return;
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    const pendingCode = this.messageCode;
    const text = this.characters.join("");
    this.characters = [];
    this.messageCode = null;
    this.lastFrameAt = 0;
    this.carry = 0;
    if (text) this.appendText(pendingCode, text);
    this.resolveDrain(pendingCode);
  }

  dispose() {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    const messageCode = this.messageCode;
    this.messageCode = null;
    this.characters = [];
    this.lastFrameAt = 0;
    this.carry = 0;
    if (messageCode) this.resolveDrain(messageCode);
    for (const code of this.drainWaiters.keys()) this.resolveDrain(code);
  }

  private schedule() {
    if (this.frame !== null || !this.characters.length) return;
    this.frame = this.requestFrame(this.tick);
  }

  private tick = (now: number) => {
    this.frame = null;
    const messageCode = this.messageCode;
    if (!messageCode) return;

    if (!this.lastFrameAt) this.lastFrameAt = now;
    const elapsed = Math.min(100, Math.max(0, now - this.lastFrameAt));
    this.lastFrameAt = now;
    const available = this.carry + elapsed * normalizeAssistantReplySpeed(this.getSpeed()) / 1000;
    const count = Math.min(this.characters.length, Math.floor(available));
    this.carry = available - count;

    if (count > 0) {
      this.appendText(messageCode, this.characters.splice(0, count).join(""));
    }
    if (this.characters.length) {
      this.schedule();
      return;
    }

    this.messageCode = null;
    this.lastFrameAt = 0;
    this.carry = 0;
    this.resolveDrain(messageCode);
  };

  private resolveDrain(messageCode: string) {
    const waiters = this.drainWaiters.get(messageCode);
    if (!waiters) return;
    this.drainWaiters.delete(messageCode);
    waiters.forEach((resolve) => resolve());
  }

  private requestFrame(callback: FrameRequestCallback) {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      return window.requestAnimationFrame(callback);
    }
    return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
  }

  private cancelFrame(frame: number) {
    if (typeof window !== "undefined" && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(frame);
    } else {
      globalThis.clearTimeout(frame);
    }
  }
}
