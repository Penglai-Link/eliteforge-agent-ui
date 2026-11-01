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

  it("keeps a late phase on the same message and never appends its text twice", () => {
    const stream = new AssistantMessageStream(session);
    stream.receive(frame("TEXT_MESSAGE_START", "step", undefined, 1));
    stream.receive(frame("TEXT_MESSAGE_CONTENT", "step", "Checking", 2));
    const end = { ...frame("TEXT_MESSAGE_END", "step", undefined, 3), metadata: { framework: { message: { phase: "commentary", outputIndex: 2 } }, tron: { eventId: "frame:3" } } };
    expect(stream.receive(end)?.message).toMatchObject({ content: "Checking", phase: "commentary" });
    const corrected = stream.receive({ type: "CUSTOM", threadId: "SESSION", name: "framework.message.metadata", value: { messageId: "step", phase: "commentary" } });
    expect(corrected?.message).toMatchObject({ content: "Checking", phase: "commentary" });
    expect(corrected?.ended).toBe(true);
  });

  it("enriches an already-ended message from a replayed end event", () => {
    const stream = new AssistantMessageStream(session);
    stream.receive(frame("TEXT_MESSAGE_CONTENT", "step", "Checking", 1));
    stream.receive(frame("TEXT_MESSAGE_END", "step", undefined, 2));
    const end = { ...frame("TEXT_MESSAGE_END", "step", undefined, 2), metadata: { framework: { message: { phase: "commentary" } }, tron: { eventId: "frame:2" } } };
    expect(stream.receive(end)?.message).toMatchObject({ phase: "commentary", content: "Checking" });
  });

  it("keeps the longer live text and its phase when history is stale", () => {
    const stream = new AssistantMessageStream(session);
    const live = stream.receive({ ...frame("TEXT_MESSAGE_CONTENT", "step", "Checking files", 1), metadata: { framework: { message: { phase: "commentary" } } } })!.message;
    const stale: ChatMessage = { ...live, phase: undefined, content: "Checking", channel: "history" };
    expect(stream.settle([live], [stale])[0]).toMatchObject({ content: "Checking files", phase: "commentary", channel: "history" });
  });

  it("uses declared final message IDs to settle a product completion", () => {
    const stream = new AssistantMessageStream(session);
    const commentary = stream.receive({ ...frame("TEXT_MESSAGE_CONTENT", "progress", "Checking", 1), metadata: { framework: { message: { phase: "commentary" } }, tron: { eventId: "one" } } })!.message;
    const final = stream.receive({ ...frame("TEXT_MESSAGE_CONTENT", "answer", "Done", 2), metadata: { framework: { message: { phase: "final_answer" } }, tron: { eventId: "two" } } })!.message;
    stream.receive({ type: "RUN_FINISHED", threadId: "SESSION", runId: "PRODUCT-RUN", metadata: { framework: { finalMessageIds: ["answer"] } } });
    const product: ChatMessage = { ...final, id: "product", messageId: "product", runId: "PRODUCT-RUN", phase: undefined };
    expect(stream.settle([commentary, final], [product]).map(message => message.messageId)).toEqual(["progress", "answer"]);
  });

  it("also uses IDs in the completion when the terminal event was missed", () => {
    const stream = new AssistantMessageStream(session);
    const final = stream.receive(frame("TEXT_MESSAGE_CONTENT", "answer", "Done", 1))!.message;
    const product: ChatMessage = { ...final, id: "product", messageId: "product", runId: "PRODUCT-RUN", content: "Done with normalized formatting" };
    const settled = stream.settle([final], [product], [], { runId: "PRODUCT-RUN", finalMessageIds: ["answer"] });
    expect(settled.map(message => message.messageId)).toEqual(["answer"]);
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
