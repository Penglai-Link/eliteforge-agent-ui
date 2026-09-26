import type { ChatQueuedSubmission } from "./types";

const safeSteerQueueFallbackCodes = new Set([
  "STEER_NO_ACTIVE_RUN",
  "STEER_RUN_FINISHING",
  "STEER_RUN_MISMATCH",
  "STEER_RUN_STARTING",
  "STEER_RUNTIME_UNSUPPORTED",
]);

export function isSteerQueueFallbackCode(code: string | null | undefined) {
  return Boolean(code && safeSteerQueueFallbackCodes.has(code));
}

export function enqueueChatSubmission(
  queue: readonly ChatQueuedSubmission[],
  submission: ChatQueuedSubmission,
) {
  return [...queue, submission];
}

export function removeQueuedChatSubmission(
  queue: readonly ChatQueuedSubmission[],
  id: string,
) {
  return queue.filter((submission) => submission.id !== id);
}

export function takeNextQueuedChatSubmission(
  queue: readonly ChatQueuedSubmission[],
  sessionId: string,
) {
  const submissionIndex = queue.findIndex(
    (submission) => submission.sessionId === sessionId,
  );
  if (submissionIndex < 0) {
    return {
      submission: null,
      remaining: [...queue],
    };
  }

  return {
    submission: queue[submissionIndex],
    remaining: queue.filter((_, index) => index !== submissionIndex),
  };
}
