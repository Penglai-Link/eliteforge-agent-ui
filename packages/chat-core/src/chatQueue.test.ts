import { describe, expect, it } from "vitest";

import type { ChatQueuedSubmission } from "./types";
import {
  enqueueChatSubmission,
  isSteerQueueFallbackCode,
  removeQueuedChatSubmission,
  reorderQueuedChatSubmission,
  takeNextQueuedChatSubmission,
} from "./chatQueue";

function submission(
  id: string,
  sessionId: string,
  content = id,
): ChatQueuedSubmission {
  return {
    id,
    sessionId,
    input: {
      content,
    },
  };
}

describe("chat submission queue", () => {
  it("only retries steer after a definitive pre-admission rejection", () => {
    expect(isSteerQueueFallbackCode("STEER_RUN_FINISHING")).toBe(true);
    expect(isSteerQueueFallbackCode("STEER_RUNTIME_UNSUPPORTED")).toBe(true);
    expect(isSteerQueueFallbackCode("STEER_REGISTRY_UNAVAILABLE")).toBe(false);
    expect(isSteerQueueFallbackCode(undefined)).toBe(false);
  });

  it("enqueues submissions in FIFO order without mutating the source queue", () => {
    const first = submission("first", "SESSION-1");
    const second = submission("second", "SESSION-1");
    const queue = [first];

    const nextQueue = enqueueChatSubmission(queue, second);

    expect(nextQueue).toEqual([first, second]);
    expect(queue).toEqual([first]);
    expect(nextQueue).not.toBe(queue);
  });

  it("removes a queued submission by id without changing the remaining order", () => {
    const first = submission("first", "SESSION-1");
    const second = submission("second", "SESSION-2");
    const third = submission("third", "SESSION-1");
    const queue = [first, second, third];

    const nextQueue = removeQueuedChatSubmission(queue, "second");

    expect(nextQueue).toEqual([first, third]);
    expect(queue).toEqual([first, second, third]);
  });

  it("reorders only the dragged submission and keeps the source queue intact", () => {
    const queue = [submission("first", "SESSION-1"), submission("second", "SESSION-1"), submission("third", "SESSION-1")];
    expect(reorderQueuedChatSubmission(queue, "third", "first").map(item => item.id)).toEqual(["third", "first", "second"]);
    expect(queue.map(item => item.id)).toEqual(["first", "second", "third"]);
    expect(reorderQueuedChatSubmission(queue, "missing", "first")).toEqual(queue);
  });

  it("takes the first queued submission for a session and preserves other sessions", () => {
    const otherSession = submission("other", "SESSION-2");
    const firstMatch = submission("first", "SESSION-1");
    const secondMatch = submission("second", "SESSION-1");

    const result = takeNextQueuedChatSubmission(
      [otherSession, firstMatch, secondMatch],
      "SESSION-1",
    );

    expect(result.submission).toBe(firstMatch);
    expect(result.remaining).toEqual([otherSession, secondMatch]);
  });

  it("returns null and an unchanged copy when the session has no queued submission", () => {
    const queue = [submission("first", "SESSION-1")];

    const result = takeNextQueuedChatSubmission(queue, "SESSION-2");

    expect(result.submission).toBeNull();
    expect(result.remaining).toEqual(queue);
    expect(result.remaining).not.toBe(queue);
  });
});
