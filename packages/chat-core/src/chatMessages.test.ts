import { describe, expect, it } from "vitest";

import type { ChatMessage } from "./types";
import { mergeChatMessagesChronologically } from "./chatMessages";

function message(
  id: number | string,
  messageId: string,
  createdAt: string,
  content = messageId,
): ChatMessage {
  return {
    actor: "user",
    channel: "MAIN_AGENT",
    content,
    createdAt,
    id,
    messageId,
    role: "USER",
    sessionId: "SESSION-1",
  };
}

describe("chat message merging", () => {
  it("keeps persisted chronology when a steer ACK arrived before the run result", () => {
    const original = message(
      "7483732119806541824",
      "MSG-ORIGINAL",
      "2026-07-17T03:59:38.000Z",
    );
    const steer = message(
      "7483732137875603456",
      "MSG-STEER",
      "2026-07-17T03:59:42.000Z",
    );
    const answer = {
      ...message(
        "7483732175000000000",
        "MSG-ANSWER",
        "2026-07-17T03:59:51.000Z",
      ),
      role: "ASSISTANT" as const,
    };

    const result = mergeChatMessagesChronologically(
      [steer],
      [original, answer],
    );

    expect(result.map((item) => item.messageId)).toEqual([
      "MSG-ORIGINAL",
      "MSG-STEER",
      "MSG-ANSWER",
    ]);
  });

  it("lets persisted messages replace duplicates and removes optimistic entries", () => {
    const stale = message(2, "MSG-2", "2026-07-17T04:00:02.000Z", "stale");
    const persisted = message(
      2,
      "MSG-2",
      "2026-07-17T04:00:02.000Z",
      "persisted",
    );
    const optimistic = message(
      "optimistic",
      "OPTIMISTIC-1",
      "2026-07-17T04:00:01.000Z",
    );

    const result = mergeChatMessagesChronologically(
      [stale, optimistic],
      [persisted],
      [optimistic.messageId],
    );

    expect(result).toEqual([persisted]);
  });

  it("orders messages from one model step by numeric output index", () => {
    const step = { id: "step", runId: "run", nodeInvocationId: null, sequence: 1, attempt: 1, name: "chat", model: null,
      status: "Completed" as const, usage: null, startedAtMs: 1, finishedAtMs: 2 };
    const item = (index: number): ChatMessage => ({ ...message(`step/message/${index}`, `step/message/${index}`, "2026-07-17T04:00:02.000Z"),
      role: "ASSISTANT", history: { message: { id: `step/message/${index}`, runId: "run", stepId: "step", role: "Assistant",
        outputIndex: index, content: [], structured: null, status: "Completed", createdAtMs: 1 }, step, tools: [], run: null, interactions: [] } });
    expect(mergeChatMessagesChronologically([], [item(10), item(2)]).map(value => value.messageId)).toEqual(["step/message/2", "step/message/10"]);
  });
});
