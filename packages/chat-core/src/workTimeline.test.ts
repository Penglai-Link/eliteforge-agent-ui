import { expect, it } from "vitest";
import { buildTranscriptWorkTimeline, workTimelineElapsedMilliseconds } from "./workTimeline";
import { historyMessages, type SessionHistory } from "./history";
import type { ChatAguiStreamEvent, ChatMessage, ChatUserInputRequest } from "./types";
import { buildTranscriptPresentation, type TranscriptPresentation } from "./transcript";
import { summarizeToolActions } from "./toolActionSummary";
import { contiguousToolEvents, contiguousToolHistory } from "../../../contracts/tool-group-contiguous-history";

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
const items = (run: ReturnType<typeof buildTranscriptWorkTimeline>["before"] extends Map<string, infer T> ? T : never) => run[0].items.flatMap(item => item.kind === "message" ? [item.id] : item.kind === "reasoning" ? [item.value.summary] : item.kind === "toolGroup" ? [item.value.toolCards.map(tool => tool.toolCallId).join("+")] : [item.value.toolCallId]);

it.each([false, true])("combines consecutive search and execute steps into one summary with history (replay=%s)", replay => {
  const messages = historyMessages(contiguousToolHistory);
  const view = buildTranscriptPresentation({ messages, liveAguiEvents: replay ? contiguousToolEvents : [], sessionId: "SESSION-1" });
  const run = [...buildTranscriptWorkTimeline(messages, view, [], { showReasoningCards: false }).before.values()].flat()[0];
  const groups = run.items.filter(item => item.kind === "toolGroup");
  expect(groups).toHaveLength(1);
  expect(groups[0].value.toolCards.map(tool => tool.toolCallId)).toEqual(["search", "execute"]);
  expect(summarizeToolActions(groups[0].value.toolCards)).toMatchObject({ searches: 1, otherActions: 1 });
  expect(run.items.some(item => item.kind === "reasoning")).toBe(false);
  const visibleThoughtRun = [...buildTranscriptWorkTimeline(messages, view, [], { showReasoningCards: true }).before.values()].flat()[0];
  expect(visibleThoughtRun.items.filter(item => item.kind === "toolGroup")).toHaveLength(2);
});

it("interleaves reasoning, separate step outputs and tools in source order even with identical timestamps", () => {
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(events()));
  const run = timeline.before.get("step-1")!;
  expect(run).toHaveLength(1);
  expect(items(run)).toEqual(["thought-1"]);
  expect(items(timeline.after.get("step-1")!)).toEqual(["thought-2", "tool-1"]);
  expect(items(timeline.after.get("step-2")!)).toEqual(["thought-3"]);
  expect(timeline.after.get("final")![0].completed).toBe(false);
  expect(run[0].completed).toBe(true);
  expect(run[0].finalMessageId).toBeUndefined();
  expect([...timeline.processMessageIds]).toEqual([]);
});

it("keeps each contiguous batch of tool calls after its process message", () => {
  const source = events();
  const toolIndex = source.findIndex(event => event.type === "TOOL_CALL_START");
  const extraTools = ["tool-2", "tool-3"].flatMap((toolCallId) => {
    const sequence = Number(toolCallId.slice(-1)) + 100;
    const metadata = { framework: { ...source[toolIndex]!.metadata?.framework, sourceSequence: sequence } };
    return [
      { ...source[toolIndex]!, metadata, toolCallId, timestamp: 1000 },
      { ...source[toolIndex + 1]!, metadata: { framework: { ...metadata.framework, sourceSequence: sequence + 1 } }, toolCallId, timestamp: 1000 },
    ];
  });
  source.splice(toolIndex + 2, 0, ...extraTools);
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(source));
  const run = timeline.after.get("step-1")![0];
  expect(items([run])).toEqual(["thought-2", "tool-1+tool-2+tool-3"]);
  expect(run.items.find(item => item.kind === "toolGroup")?.value.toolCards).toHaveLength(3);
});

it("retains a summary group for each single-tool phase after completion", () => {
  const source = events();
  source.push({ ...source[0], type: "RUN_FINISHED" });
  const run = buildTranscriptWorkTimeline(messages(), presentation(source)).after.get("step-1")![0];
  expect(run.completed).toBe(true);
  expect(run.items.filter(item => item.kind === "tool")).toEqual([]);
  expect(run.items.filter(item => item.kind === "toolGroup").map(item => item.value.toolCards.length)).toEqual([1]);
});

it("keeps every reply visible while execution success alone marks the final outcome", () => {
  const source = events();
  const active = buildTranscriptWorkTimeline(messages(), presentation(source)).before.get("step-1")![0];
  source.push({ ...source[0], type: "RUN_FINISHED", timestamp: 2000, metadata: { framework: { runId: "native", sourceSequence: 100 } } });
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(source));
  const final = timeline.before.get("step-1")![0];
  expect(final.completed).toBe(true); expect(final.finalMessageId).toBe("final");
  expect(final.items.map(item => item.id)).toEqual(active.items.map(item => item.id));
  expect([...timeline.processMessageIds]).toEqual([]);
});

it("keeps explicit commentary and answer messages in the transcript", () => {
  const source = events();
  source.push({ ...source[0], type: "RUN_FINISHED", metadata: { framework: { runId: "native", sourceSequence: 100 } } });
  const input = messages().map(value => value.messageId === "step-1" ? { ...value, phase: "commentary" }
    : value.messageId === "final" ? { ...value, phase: "final_answer" } : value);
  const timeline = buildTranscriptWorkTimeline(input, presentation(source));
  const run = timeline.before.get("step-1")![0];
  expect(run.finalMessageId).toBe("final");
  expect(timeline.processMessageIds.has("step-1")).toBe(false);
  expect(timeline.processMessageIds.has("step-2")).toBe(false);
  expect(run.items.some(item => item.kind === "message" && item.id === "step-1")).toBe(false);
});

it.each(["live", "replay", "history"] as const)("places tools after their phased parent across %s", mode => {
  const page: SessionHistory = { sessionId: "S", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
    runs: [{ id: "native", sessionId: "S", parentRunId: null, rootRunId: "native", status: "Completed", startedAtMs: 1000, finishedAtMs: 2000, error: null }],
    records: { steps: [], interactions: [], messages: [
      { id: "user", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "Question" }], structured: null, status: "Completed", createdAtMs: 1000 },
      { id: "progress-1", runId: "native", stepId: "step", role: "Assistant", phase: "commentary", outputIndex: 0, content: [{ type: "Text", text: "First" }], structured: null, status: "Completed", createdAtMs: 1100 },
      { id: "progress-2", runId: "native", stepId: "step", role: "Assistant", phase: "commentary", outputIndex: 2, content: [{ type: "Text", text: "Second" }], structured: null, status: "Completed", createdAtMs: 1100 },
      { id: "final", runId: "native", stepId: "step", role: "Assistant", phase: "final_answer", outputIndex: 4, content: [{ type: "Text", text: "Done" }], structured: null, status: "Completed", createdAtMs: 1100 },
    ], toolInvocations: ["progress-1", "progress-2"].map((parent, index) => ({
      id: `tool-${index}`, callId: `tool-${index}`, runId: "native", stepId: "step", messageId: parent,
      toolId: "search", toolName: "tool_search", arguments: {}, content: [], structured: null,
      status: "Completed" as const, isError: false, resultReference: null, startedAtMs: 1200 + index, finishedAtMs: 1300 + index,
    })) } };
  let sequence = 0;
  const event = (type: string, data: Partial<ChatAguiStreamEvent> = {}): ChatAguiStreamEvent => ({
    type, timestamp: 1100, threadId: "S", runId: "execution", metadata: { framework: { runId: "native", sourceSequence: ++sequence } }, ...data,
  });
  const source = [event("RUN_STARTED"), event("TEXT_MESSAGE_START", { messageId: "progress-1" }),
    event("TEXT_MESSAGE_END", { messageId: "progress-1" }),
    event("TOOL_CALL_START", { toolCallId: "tool-0", toolCallName: "tool_search", parentMessageId: "progress-1" }),
    event("TOOL_CALL_RESULT", { toolCallId: "tool-0", content: "ok" }),
    event("TEXT_MESSAGE_START", { messageId: "progress-2" }), event("TEXT_MESSAGE_END", { messageId: "progress-2" }),
    event("TOOL_CALL_START", { toolCallId: "tool-1", toolCallName: "tool_search", parentMessageId: "progress-2" }),
    event("TOOL_CALL_RESULT", { toolCallId: "tool-1", content: "ok" }),
    event("TEXT_MESSAGE_START", { messageId: "final" }), event("TEXT_MESSAGE_END", { messageId: "final" }), event("RUN_FINISHED")];
  const input = mode === "live" ? [message("user", "Question", "USER"),
    { ...message("progress-1"), phase: "commentary" }, { ...message("progress-2"), phase: "commentary" },
    { ...message("final"), phase: "final_answer" }] : historyMessages(page);
  const timeline = buildTranscriptWorkTimeline(input, presentation(mode === "history" ? [] : source));
  expect(timeline.before.get("progress-1")).toBeUndefined();
  expect(items(timeline.after.get("progress-1")!)).toEqual(["tool-0"]);
  expect(items(timeline.after.get("progress-2")!)).toEqual(["tool-1"]);
  expect(timeline.after.get("progress-1")![0].includeRunMetadata).toBe(false);
  expect(timeline.after.get("progress-2")![0].finalMessageId).toBe("final");
  expect(timeline.processMessageIds.has("progress-1")).toBe(false);
});

it("keeps completed text-only executions after an assistant-only recovery with a native run alias", () => {
  const source = events().filter(event => ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"].includes(event.type));
  source.push({ ...source[0], type: "RUN_FINISHED" });
  const input = messages().slice(1);
  const view = buildTranscriptPresentation({ messages: input, liveAguiEvents: source, sessionId: "S" });
  const timeline = buildTranscriptWorkTimeline(input, view);
  expect(timeline.before.get("step-1")![0].completed).toBe(true);
  expect(timeline.before.get("step-1")![0].finalMessageId).toBe("final");
  expect([...timeline.processMessageIds]).toEqual([]);
});

it.each(["AGENT_CANCELLED", "MODEL_PROVIDER_FAILED", "AGUI_BACKPRESSURE"])("never promotes partial text to a final answer after %s", code => {
  const source = events(); source.push({ ...source[0], type: "RUN_ERROR", code });
  const timeline = buildTranscriptWorkTimeline(messages(), presentation(source));
  const run = [...timeline.before.values(), ...timeline.after.values()].flat().find(run => run.includeRunMetadata !== false)!;
  expect(timeline.processMessageIds.size).toBe(0);
  expect(run.finalMessageId).toBeUndefined();
  expect(run.completed).toBe(code !== "AGUI_BACKPRESSURE");
});

it("does not fold an unanswered interaction or manufacture a final from its prompt", () => {
  const source = events(); source.push({ ...source[0], type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [] } });
  const pending = { requestId: "question", status: "Pending", runId: "native" } as ChatUserInputRequest;
  const active = buildTranscriptWorkTimeline(messages(), presentation(source), [pending]).after.get("final")![0];
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
    ], toolInvocations: [
      { id: "tool-1", callId: "call-1", runId: "native", stepId: "step", messageId: "step-1", toolId: "shell", toolName: "bash_exec", arguments: { command: "pwd" }, content: [{ type: "Text", text: "/project" }], structured: null, status: "Completed", isError: false, resultReference: null, startedAtMs: 2100, finishedAtMs: 2200 },
      { id: "tool-2", callId: "call-2", runId: "native", stepId: "step", messageId: "step-1", toolId: "shell", toolName: "bash_exec", arguments: { command: "git status" }, content: [{ type: "Text", text: "clean" }], structured: null, status: "Completed", isError: false, resultReference: null, startedAtMs: 2300, finishedAtMs: 2400 },
    ] } };
  const timeline = buildTranscriptWorkTimeline(historyMessages(page), presentation([]));
  const run = timeline.before.get("step-1")!;
  expect(items(run)).toEqual(["thought-1"]);
  expect(items(timeline.after.get("step-1")!)).toEqual(["tool-1+tool-2", "thought-final"]);
  expect(timeline.after.get("step-1")![0].items.find(item => item.kind === "toolGroup")?.value.toolCards).toHaveLength(2);
  expect(run[0].finalMessageId).toBe("final"); expect(run[0].completed).toBe(true);
});

it("keeps answer continuations in their own user boundary even when a host reuses the run alias", () => {
  const first = events().filter(event => event.messageId !== "final");
  first.push({ ...first[0], type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [] } });
  const next = events().map(event => ({ ...event, timestamp: 4000, messageId: event.messageId ? "resumed-" + event.messageId : undefined }));
  const input = [message("user", "Question", "USER"), message("step-1"), message("step-2"), message("answer", "Yes", "USER", 3000), message("resumed-step-1", "Next step", "ASSISTANT", 4000)];
  const timeline = buildTranscriptWorkTimeline(input, presentation([...first, ...next]));
  expect(timeline.before.get("step-1")![0].completed).toBe(true);
  expect(timeline.after.get("resumed-step-1")![0].completed).toBe(false);
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
  expect(items(timeline.before.get("ask")!)).toEqual(["ask-call"]);
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
  expect(timeline.after.get("save")?.[0].completed).toBe(false);
  expect([...timeline.before.keys()]).toEqual(["first-question", "second-question", "save"]);
});

it("splits a steered run as soon as the accepted user message appears and freezes each segment timer", () => {
  const source: ChatAguiStreamEvent[] = [
    { type: "RUN_STARTED", runId: "execution", threadId: "S", timestamp: 1000, metadata: { framework: { runId: "native" } } },
    { type: "TEXT_MESSAGE_START", runId: "execution", threadId: "S", timestamp: 1100, messageId: "first-step" },
    { type: "TEXT_MESSAGE_CONTENT", runId: "execution", threadId: "S", timestamp: 1200, messageId: "first-step", delta: "Working before steer" },
    { type: "TEXT_MESSAGE_END", runId: "execution", threadId: "S", timestamp: 1300, messageId: "first-step" },
    { type: "TEXT_MESSAGE_START", runId: "execution", threadId: "S", timestamp: 2600, messageId: "steered-step" },
    { type: "TEXT_MESSAGE_CONTENT", runId: "execution", threadId: "S", timestamp: 2700, messageId: "steered-step", delta: "Working after steer" },
    { type: "TEXT_MESSAGE_END", runId: "execution", threadId: "S", timestamp: 2800, messageId: "steered-step" },
    { type: "TEXT_MESSAGE_START", runId: "execution", threadId: "S", timestamp: 3900, messageId: "final" },
    { type: "TEXT_MESSAGE_CONTENT", runId: "execution", threadId: "S", timestamp: 3950, messageId: "final", delta: "Done" },
    { type: "TEXT_MESSAGE_END", runId: "execution", threadId: "S", timestamp: 3990, messageId: "final" },
    { type: "RUN_FINISHED", runId: "execution", threadId: "S", timestamp: 4000, metadata: { framework: { runId: "native" } } },
  ];
  const input = [
    message("first-user", "Start", "USER", 1000),
    message("first-step", "Before steer", "ASSISTANT", 1500),
    message("steer-user", "Change direction", "USER", 2000),
    message("steered-step", "After steer", "ASSISTANT", 3000),
    message("second-steer", "One more change", "USER", 3500),
    message("final", "Final answer", "ASSISTANT", 3990),
  ];
  const timeline = buildTranscriptWorkTimeline(input, presentation(source, "first-user"));
  const first = timeline.before.get("first-step")![0]!;
  const second = timeline.before.get("steered-step")![0]!;
  const final = timeline.before.get("final")![0]!;

  expect(first).toMatchObject({ completed: true, segmentFinishedAtMs: 2000 });
  expect(workTimelineElapsedMilliseconds(first, 9000)).toBe(1000);
  expect(second).toMatchObject({ completed: true, segmentStartedAtMs: 2000, segmentFinishedAtMs: 3500 });
  expect(workTimelineElapsedMilliseconds(second, 9000)).toBe(1500);
  expect(final).toMatchObject({ completed: true, segmentStartedAtMs: 3500, finalMessageId: "final" });
  expect(workTimelineElapsedMilliseconds(final, 9000)).toBe(500);
});

it("reconstructs steer segment timing after AG-UI events have been replaced by history", () => {
  const historyRun = { id: "native", sessionId: "S", parentRunId: null, rootRunId: "native", status: "Completed" as const,
    startedAtMs: 1000, finishedAtMs: 4000, error: null };
  const historyAssistant = (id: string, time: number, content: string): ChatMessage => ({
    ...message(id, content, "ASSISTANT", time),
    history: {
      message: { id, runId: "native", stepId: null, role: "Assistant", content: [{ type: "Text", text: content }],
        structured: null, status: "Completed", createdAtMs: time },
      step: null, tools: [], run: historyRun, interactions: [],
    },
  });
  const input = [
    message("first-user", "Start", "USER", 1000),
    historyAssistant("first-step", 1500, "Before steer"),
    message("steer-user", "Change direction", "USER", 2000),
    historyAssistant("final", 3990, "Final answer"),
  ];
  const timeline = buildTranscriptWorkTimeline(input, presentation([]));
  const first = timeline.before.get("first-step")![0]!;
  const final = timeline.before.get("final")![0]!;

  expect(first).toMatchObject({ completed: true, segmentFinishedAtMs: 2000 });
  expect(first.finalMessageId).toBeUndefined();
  expect(workTimelineElapsedMilliseconds(first, 9000)).toBe(1000);
  expect(final).toMatchObject({ completed: true, segmentStartedAtMs: 2000, finalMessageId: "final" });
  expect(workTimelineElapsedMilliseconds(final, 9000)).toBe(2000);
});

it("freezes an unanswered interaction at its request time and resumes on a new execution", () => {
  const source = events();
  const pending = { requestId: "q", status: "Pending", runId: "native", requestedAt: 2500 } as ChatUserInputRequest;
  const waiting = buildTranscriptWorkTimeline(messages(), presentation(source), [pending]).after.get("final")![0];
  expect(waiting.waitingAtMs).toBe(2500);
  expect(workTimelineElapsedMilliseconds(waiting, 9000)).toBe(1500);
  expect(workTimelineElapsedMilliseconds(waiting, 30000)).toBe(1500);
  const resumedEvents = [{ ...source[0], timestamp: 12000 }];
  const resumed = buildTranscriptWorkTimeline(messages(), presentation(resumedEvents), [{ ...pending, status: "Answered" }]).after.get("final")![0];
  expect(resumed.waitingAtMs).toBeUndefined();
  expect(workTimelineElapsedMilliseconds(resumed, 14000)).toBe(2000);
});

it("uses the interruption timestamp over later events while waiting", () => {
  const source = events();
  source.push({ ...source[0], type: "RUN_FINISHED", timestamp: 3000, outcome: { type: "interrupt", interrupts: [] } });
  source.push({ ...source[0], type: "CUSTOM", timestamp: 8000, name: "late" });
  const pending = { requestId: "q", status: "Pending", runId: "native", requestedAt: 1000 } as ChatUserInputRequest;
  const waiting = buildTranscriptWorkTimeline(messages(), presentation(source), [pending]).after.get("final")![0];
  expect(waiting.waitingAtMs).toBe(3000);
  expect(workTimelineElapsedMilliseconds(waiting, 12000)).toBe(2000);
});


it("keeps partial replies visible without mislabelling them as a successful final after failure", () => {
  const input = messages();
  const source = [...events(), { ...events()[0], type: "RUN_FINISHED", timestamp: 2000 }];
  const completed = buildTranscriptWorkTimeline(input, presentation(source));
  expect(input.filter(message => completed.processMessageIds.has(message.messageId))).toEqual([]);
  for (const rail of [...completed.before.values(), ...completed.after.values()].flat()) {
    expect(rail.items.some(item => item.kind === "message")).toBe(false);
  }
  const failed = buildTranscriptWorkTimeline(input, presentation([...events(), { ...events()[0], type: "RUN_ERROR", timestamp: 2000 }]));
  expect(failed.processMessageIds.size).toBe(0);
  expect([...failed.before.values(), ...failed.after.values()].flat().some(run => run.finalMessageId)).toBe(false);
});
