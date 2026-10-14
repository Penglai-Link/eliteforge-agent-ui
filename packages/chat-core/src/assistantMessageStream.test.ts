import { describe, expect, it } from "vitest";
import { AssistantMessageStream } from "./assistantMessageStream";
import type { ChatAguiStreamEvent, ChatMessage } from "./types";

const session = { sessionId: "SESSION", displayName: "main-agent" };
const frame = (type: string, messageId: string, delta?: string, sequence = 1): ChatAguiStreamEvent => ({
  type, messageId, delta, runId: "PRODUCT-RUN", threadId: "SESSION", timestamp: 1000,
  metadata: { framework: { runId: "NATIVE-RUN" }, tron: { eventId: `frame:${sequence}` } },
});

describe("assistant message stream", () => {
  it("keeps each model step separate before the run finishes and closes on message boundaries", () => {
    const stream = new AssistantMessageStream(session);
    stream.receive(frame("TEXT_MESSAGE_START", "first", undefined, 1));
    expect(stream.receive(frame("TEXT_MESSAGE_CONTENT", "first", "Checking files", 2))?.message.content).toBe("Checking files");
    expect(stream.activeMessageId).toBe("first");
    expect(stream.receive(frame("TEXT_MESSAGE_END", "first", undefined, 3))?.ended).toBe(true);
    expect(stream.activeMessageId).toBeNull();
    stream.receive(frame("TEXT_MESSAGE_START", "second", undefined, 4));
    const second = stream.receive(frame("TEXT_MESSAGE_CONTENT", "second", "Checking dependencies", 5));
    expect(second?.message).toMatchObject({ messageId: "second", runId: "NATIVE-RUN", content: "Checking dependencies" });
    expect(stream.messageIds).toEqual(["first", "second"]);
    expect(stream.receive(frame("TEXT_MESSAGE_CONTENT", "first", "late rewrite", 6))).toBeNull();
  });

  it("deduplicates replay identities but retains two genuinely equal text chunks", () => {
    const stream = new AssistantMessageStream(session);
    const first = frame("TEXT_MESSAGE_CONTENT", "message", "ha", 1);
    stream.receive(first);
    expect(stream.receive({ ...first })).toBeNull();
    expect(stream.receive(frame("TEXT_MESSAGE_CONTENT", "message", "ha", 2))?.message.content).toBe("haha");
  });

  it("does not show user/tool messages or foreign-session frames as assistant output", () => {
    const stream = new AssistantMessageStream(session);
    expect(stream.receive({ ...frame("TEXT_MESSAGE_START", "user"), role: "user" })).toBeNull();
    expect(stream.receive(frame("TEXT_MESSAGE_CONTENT", "user", "input", 2))).toBeNull();
    expect(stream.identified).toBe(true);
    expect(stream.receive({ ...frame("TEXT_MESSAGE_CONTENT", "foreign", "text", 3), threadId: "OTHER" })).toBeNull();
    expect(stream.messageIds).toEqual([]);
  });

  it("reconciles only a matching final product message and preserves native IDs for history", () => {
    const stream = new AssistantMessageStream(session);
    const first = stream.receive(frame("TEXT_MESSAGE_CONTENT", "first", "Summary", 1))!.message;
    stream.receive(frame("TEXT_MESSAGE_END", "first", undefined, 2));
    const final = stream.receive(frame("TEXT_MESSAGE_CONTENT", "final", "Final answer", 3))!.message;
    stream.receive(frame("TEXT_MESSAGE_END", "final", undefined, 4));
    const product: ChatMessage = { ...final, id: "product-final", messageId: "product-final", runId: "PRODUCT-RUN", content: "Final answer\n\n" };
    const settled = stream.settle([first, final], [product]);
    expect(settled.map(message => message.messageId)).toEqual(["first", "final"]);
    expect(stream.settle([first, final], [{ ...product, content: "Summary" }])).toHaveLength(3);
    expect(stream.settle(settled, [{ ...final, channel: "history" }]).find(message => message.messageId === "final")?.channel).toBe("history");
  });
});
