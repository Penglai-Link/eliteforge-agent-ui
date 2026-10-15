import { expect, it } from "vitest";
import { buildTranscriptWorkTimeline } from "./workTimeline";
import { historyMessages, type SessionHistory } from "./history";
import type { ChatAguiStreamEvent, ChatMessage, ChatUserInputRequest } from "./types";
import { buildTranscriptPresentation, type TranscriptPresentation } from "./transcript";

const message = (id: string, content = id, role: "USER" | "ASSISTANT" = "ASSISTANT", time = 1000): ChatMessage => ({
  id, messageId: id, sessionId: "S", runId: "native", role, content, actor: role, channel: "conversation", createdAt: new Date(time).toISOString(),
});
function events() {
  let sequence = 0;
  const event = (type: string, data: Partial<ChatAguiStreamEvent> = {}): ChatAguiStreamEvent => ({
    type, timestamp: 1000, threadId: "S", runId: "execution", metadata: { framework: { runId: "native", sourceSequence: ++sequence } }, ...data,
  });
  const reasoning = (id: string) => [event("REASONING_START", { messageId: id }), event("REASONING_MESSAGE_CONTENT", { messageId: id, delta: id }), event("REASONING_END", { messageId: id })];
  const text = (id: string) => [event("TEXT_MESSAGE_START", { messageId: id, role: "assistant" }), event("TEXT_MESSAGE_CONTENT", { messageId: id, delta: id }), event("TEXT_MESSAGE_END", { messageId: id })];
  return [event("RUN_STARTED"), ...reasoning("thought-1"), ...text("step-1"), ...reasoning("thought-2"),
    event("TOOL_CALL_START", { toolCallId: "tool-1", toolCallName: "bash_exec", toolCallArgs: { command: "pwd" } }),
    event("TOOL_CALL_RESULT", { toolCallId: "tool-1", content: "/project" }), ...text("step-2"), ...reasoning("thought-3"), ...text("final")];
}
function presentation(events: ChatAguiStreamEvent[], anchor = "user"): TranscriptPresentation {
  return { waitingForModelAnchorMessageCode: "", debugEventsByRunCode: new Map(), workRailsByMessageCode: new Map([[anchor, [{ runId: "execution", firstMillis: 1000, events }]]]) };
}
const messages = () => [message("user", "Question", "USER"), message("step-1"), message("step-2"), message("final")];
const items = (run: ReturnType<typeof buildTranscriptWorkTimeline>["before"] extends Map<string, infer T> ? T : never) => run[0].items.map(item => item.kind === "message" ? item.id : item.kind === "reasoning" ? item.value.summary : item.value.toolCallId);

it("interleaves reasoning, separate step outputs and tools in source order even with identical timestamps", () => {
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(events()));
  const run = timeline.before.get("step-1")!;
  expect(run).toHaveLength(1);
  expect(items(run)).toEqual(["thought-1", "step-1", "thought-2", "tool-1", "step-2", "thought-3", "final"]);
  expect(run[0].completed).toBe(false);
  expect(run[0].finalMessageId).toBeUndefined();
  expect([...timeline.processMessageIds]).toEqual(["step-1", "step-2", "final"]);
});

it("only execution success moves the final message out of the process; text END does not", () => {
  const source = events();
  const active = buildTranscriptWorkTimeline(messages(), presentation(source)).before.get("step-1")![0];
  source.push({ ...source[0], type: "RUN_FINISHED", timestamp: 2000, metadata: { framework: { runId: "native", sourceSequence: 100 } } });
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(source));
  const final = timeline.before.get("step-1")![0];
  expect(final.completed).toBe(true); expect(final.finalMessageId).toBe("final");
  expect(final.items.map(item => item.id)).toEqual(active.items.slice(0, -1).map(item => item.id));
  expect([...timeline.processMessageIds]).toEqual(["step-1", "step-2"]);
});

it("keeps completed text-only executions after an assistant-only recovery with a native run alias", () => {
  const source = events().filter(event => ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"].includes(event.type));
  source.push({ ...source[0], type: "RUN_FINISHED" });
  const input = messages().slice(1);
  const view = buildTranscriptPresentation({ messages: input, liveAguiEvents: source, sessionId: "S" });
  const timeline = buildTranscriptWorkTimeline(input, view);
  expect(timeline.before.get("step-1")![0].completed).toBe(true);
  expect(timeline.before.get("step-1")![0].finalMessageId).toBe("final");
  expect([...timeline.processMessageIds]).toEqual(["step-1", "step-2"]);
});

it.each(["AGENT_CANCELLED", "MODEL_PROVIDER_FAILED", "AGUI_BACKPRESSURE"])("never promotes partial text to a final answer after %s", code => {
  const source = events(); source.push({ ...source[0], type: "RUN_ERROR", code });
  const run = buildTranscriptWorkTimeline(messages(), presentation(source)).before.get("step-1")![0];
  expect(run.finalMessageId).toBeUndefined();
  expect(run.completed).toBe(code !== "AGUI_BACKPRESSURE");
});

it("does not fold an unanswered interaction or manufacture a final from its prompt", () => {
  const source = events(); source.push({ ...source[0], type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [] } });
  const pending = { requestId: "question", status: "Pending", runId: "native" } as ChatUserInputRequest;
  const active = buildTranscriptWorkTimeline(messages(), presentation(source), [pending]).before.get("step-1")![0];
  expect(active.completed).toBe(false); expect(active.finalMessageId).toBeUndefined();
  const answered = buildTranscriptWorkTimeline(messages(), presentation(source), [{ ...pending, status: "Answered" }]).before.get("step-1")![0];
  expect(answered.completed).toBe(true); expect(answered.finalMessageId).toBeUndefined();
});

it("restores the entire ordered process and separate final from structured history without replay", () => {
  const page: SessionHistory = { sessionId: "S", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
    runs: [{ id: "native", sessionId: "S", parentRunId: null, rootRunId: "native", status: "Completed", startedAtMs: 1000, finishedAtMs: 4000, error: null }],
    records: { steps: [], interactions: [], messages: [
      { id: "user", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "Question" }], structured: null, status: "Completed", createdAtMs: 1000 },
      { id: "step-1", runId: "native", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: "thought-1" }, { type: "Text", text: "step-1" }], structured: null, status: "Completed", createdAtMs: 2000 },
      { id: "final", runId: "native", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: "thought-final" }, { type: "Text", text: "final" }], structured: null, status: "Completed", createdAtMs: 3000 },
    ], toolInvocations: [{ id: "tool-1", callId: "call-1", runId: "native", stepId: "step", messageId: "step-1", toolId: "shell", toolName: "bash_exec", arguments: { command: "pwd" }, content: [{ type: "Text", text: "/project" }], structured: null, status: "Completed", isError: false, resultReference: null, startedAtMs: 2100, finishedAtMs: 2200 }] } };
  const timeline = buildTranscriptWorkTimeline(historyMessages(page), presentation([]));
  const run = timeline.before.get("step-1")!;
  expect(items(run)).toEqual(["thought-1", "step-1", "tool-1", "thought-final"]);
  expect(run[0].finalMessageId).toBe("final"); expect(run[0].completed).toBe(true);
});

it("keeps answer continuations in their own user boundary even when a host reuses the run alias", () => {
  const first = events().filter(event => event.messageId !== "final");
  first.push({ ...first[0], type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [] } });
  const next = events().map(event => ({ ...event, timestamp: 4000, messageId: event.messageId ? "resumed-" + event.messageId : undefined }));
  const input = [message("user", "Question", "USER"), message("step-1"), message("step-2"), message("answer", "Yes", "USER", 3000), message("resumed-step-1", "Next step", "ASSISTANT", 4000)];
  const timeline = buildTranscriptWorkTimeline(input, presentation([...first, ...next]));
  expect(timeline.before.get("step-1")![0].completed).toBe(true);
  expect(timeline.before.get("resumed-step-1")![0].completed).toBe(false);
  expect(timeline.before.get("step-1")![0].items.some(item => item.id === "resumed-step-1")).toBe(false);
});

it("honors an accepted answer anchor when the server starts before client acknowledgment", () => {
  const input = [message("user", "Wake up", "USER", 1000), message("ask", "", "ASSISTANT", 2000),
    { ...message("interaction:q", "Direct", "USER", 4100), interactionResponse: { requestId: "q", rows: [] } }];
  const source: ChatAguiStreamEvent[] = [{ type: "RUN_STARTED", runId: "alias", threadId: "S", timestamp: 4000,
    metadata: { framework: { runId: "native" } } }, { type: "TOOL_CALL_START", runId: "alias", threadId: "S", timestamp: 4200,
    toolCallId: "save-soul", toolCallName: "dude_soul_update", metadata: { framework: { runId: "native" } } }];
  const timeline = buildTranscriptWorkTimeline(input, presentation(source, "interaction:q"));
  expect(timeline.after.get("interaction:q")?.[0].events).toHaveLength(2);
  expect(timeline.before.get("ask")).toBeUndefined();
});

it("closes only the pre-answer segment while the same native run resumes from history", () => {
  const page: SessionHistory = { sessionId: "S", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
    runs: [{ id: "native", sessionId: "S", parentRunId: null, rootRunId: "native", status: "Running", startedAtMs: 4000, finishedAtMs: null, error: null }],
    records: { steps: [], messages: [
      { id: "user", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "Wake up" }], structured: null, status: "Completed", createdAtMs: 1000 },
      { id: "ask", runId: "native", stepId: null, role: "Assistant", content: [], structured: null, status: "Completed", createdAtMs: 2000 },
      { id: "continued", runId: "native", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: "Save the soul" }], structured: null, status: "Running", createdAtMs: 5000 },
    ], toolInvocations: [{ id: "ask-call", callId: "ask-call", runId: "native", stepId: "ask", messageId: "ask", toolId: "ask", toolName: "chat_ask_user", arguments: {}, content: [],
      structured: { frameworkInteractionId: "q" }, status: "Completed", isError: false, resultReference: null, startedAtMs: 2100, finishedAtMs: 2200 }],
      interactions: [{ id: "q", runId: "native", invocationId: null, prompt: [], responseSchema: {}, presentation: null, response: "Direct", expiresAtMs: null }] } };
  const restored = historyMessages(page);
  expect(restored.map(m => m.messageId)).toEqual(["user", "ask", "interaction:q", "continued"]);
  const timeline = buildTranscriptWorkTimeline(restored, presentation([]));
  expect(timeline.before.get("ask")?.[0]).toMatchObject({ completed: true, finalMessageId: undefined });
  expect(timeline.before.get("continued")?.[0].completed).toBe(false);
  expect(timeline.before.get("ask")?.[0].items.map(item => item.id)).toEqual(["ask-call"]);
});

it("keeps multiple accepted answers as separate boundaries in one native execution", () => {
  const historyRun = { id: "native", sessionId: "S", parentRunId: null, rootRunId: "native", status: "Running" as const, startedAtMs: 6000, finishedAtMs: null, error: null };
  const step = (id: string, time: number) => ({ ...message(id, id, "ASSISTANT", time), history: {
    message: { id, runId: "native", stepId: null, role: "Assistant" as const, content: [{ type: "Text" as const, text: id }], structured: null, status: "Completed" as const, createdAtMs: time },
    step: null, tools: [], run: historyRun, interactions: [],
  } });
  const answer = (id: string, time: number) => ({ ...message(`interaction:${id}`, "Yes", "USER", time), interactionResponse: { requestId: id, rows: [] } });
  const input = [message("user", "Wake up", "USER", 1000), step("first-question", 2000), answer("q1", 3000),
    step("second-question", 4000), answer("q2", 5000), step("save", 6000)];
  const timeline = buildTranscriptWorkTimeline(input, presentation([]), [{ requestId: "q3", runId: "native", status: "Pending" } as ChatUserInputRequest]);
  expect(timeline.before.get("first-question")?.[0].completed).toBe(true);
  expect(timeline.before.get("second-question")?.[0].completed).toBe(true);
  expect(timeline.before.get("save")?.[0].completed).toBe(false);
  expect([...timeline.before.keys()]).toEqual(["first-question", "second-question", "save"]);
});
