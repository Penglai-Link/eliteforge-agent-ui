// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatAdapter, ChatSendResult, ChatSession, SessionHistory } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";

beforeEach(() => {
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

// Same shape as the real Dude awakening: background first turn, persisted
// ask_user, and a continuation that reuses the native run ID/start timestamp.
function awakeningHistory(time: number): SessionHistory {
  const interaction = { id: "question", runId: "native", invocationId: null, prompt: [], responseSchema: { type: "object" },
    presentation: { kind: "ask_user", intro: "Choose a style", questions: [{ id: "style", question: "Which style?", options: [{ id: "direct", label: "Direct" }] }] },
    response: null, expiresAtMs: null };
  return { sessionId: "awakening", version: "1", nextCursor: null,
    runs: [{ id: "native", sessionId: "awakening", parentRunId: null, rootRunId: "native", status: "Waiting", startedAtMs: time, finishedAtMs: time + 100, error: null }],
    activeRuns: [], pendingInteractions: [interaction], records: { steps: [], interactions: [interaction], messages: [
      { id: "wake", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "Wake up" }], structured: null, status: "Completed", createdAtMs: time },
      { id: "ask", runId: "native", stepId: null, role: "Assistant", content: [], structured: null, status: "Completed", createdAtMs: time + 10 },
    ], toolInvocations: [{ id: "ask-tool", callId: "ask-tool", runId: "native", stepId: "ask", messageId: "ask", toolId: "ask", toolName: "chat_ask_user",
      arguments: {}, content: [], structured: { frameworkInteractionId: "question" }, status: "Completed", isError: false, resultReference: null, startedAtMs: time + 20, finishedAtMs: time + 100 }] } };
}

it("restores background awakening, places resumed tools after the answer, and releases input despite internal work", async () => {
  const time = Date.now() - 10_000;
  const session: ChatSession = { id: "awakening", sessionId: "awakening", title: "Awakening", status: "ACTIVE", createdAt: new Date(time).toISOString(), updatedAt: new Date(time).toISOString() };
  let history = awakeningHistory(time);
  let observer: Parameters<NonNullable<ChatAdapter["answerUserInputRequestStream"]>>[3];
  let finish!: (value: ChatSendResult) => void;
  const host: ChatAdapter = { capabilities: { supportsAgui: true, supportsStreaming: true, supportsUserInputRequests: true, supportsActiveRun: true, supportsStop: true },
    createSession: vi.fn(), loadMessages: vi.fn(), loadAguiEvents: vi.fn(), streamMessage: vi.fn(), stopRun: vi.fn(),
    getActiveRun: vi.fn(async () => ({ sessionId: session.sessionId, activeRun: null })), loadHistory: vi.fn(async () => history),
    answerUserInputRequestStream: vi.fn((_session, _id, _input, handlers) => { observer = handlers; return new Promise(resolve => { finish = resolve; }); }) };
  const onRunStateChange = vi.fn();
  const props = { adapter: host, initialSession: session, config: { floating: false }, onRunStateChange, onError: vi.fn() };
  const view = render(<ChatRuntimeWindow {...props} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Direct" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(host.answerUserInputRequestStream).toHaveBeenCalledOnce());
  const frame = (type: string, extra = {}) => ({ type, runId: "product", threadId: "awakening", timestamp: time + 1000,
    metadata: { framework: { runId: "native" } }, ...extra });
  act(() => {
    observer?.onAguiEvent?.(frame("RUN_STARTED"));
    observer?.onAguiEvent?.(frame("TOOL_CALL_START", { toolCallId: "save-tool", toolCallName: "dude_soul_update" }));
  });
  fireEvent.click(screen.getByRole("button", { name: /Working for/ }));
  await waitFor(() => expect(view.container.querySelector('[data-work-item-id="product:save-tool"]')).toBeTruthy());
  const answer = view.container.querySelector('[data-history-interaction-id="question"]')!;
  const tool = view.container.querySelector('[data-work-item-id="product:save-tool"]')!;
  expect(answer.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(view.container.querySelectorAll('[data-history-interaction-id="question"]')).toHaveLength(1);

  history = structuredClone(history);
  history.runs[0] = { ...history.runs[0], status: "Completed", startedAtMs: time + 1000, finishedAtMs: time + 2000 };
  history.records.interactions[0].response = { answers: { style: { option_id: "direct" } } };
  history.pendingInteractions = [];
  history.records.messages.push({ id: "resume", runId: "native", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: "Save the confirmed soul" }], structured: null, status: "Completed", createdAtMs: time + 1100 });
  history.records.toolInvocations.push({ id: "save-tool", callId: "save-tool", runId: "native", stepId: "resume", messageId: "resume", toolId: "save", toolName: "dude_soul_update", arguments: {}, content: [{ type: "Text", text: "Saved" }], structured: null, status: "Completed", isError: false, resultReference: null, startedAtMs: time + 1200, finishedAtMs: time + 1300 });
  history.records.messages.push({ id: "final", runId: "native", stepId: null, role: "Assistant", content: [{ type: "Text", text: "Soul saved" }], structured: null, status: "Completed", createdAtMs: time + 1500 });
  // Historical auxiliary execution must never keep the foreground composer busy.
  const internal = { ...history.runs[0], id: "internal", rootRunId: "internal", status: "Running" as const, finishedAtMs: null };
  history.runs.push(internal); history.activeRuns = [internal];
  await act(async () => { finish({ session, run: { runId: "product", status: "COMPLETED", finalOutput: "Soul saved", stepCount: 1 },
    messages: [{ id: "final", messageId: "final", sessionId: "awakening", runId: "native", role: "ASSISTANT", actor: "Dude", channel: "chat", content: "Soul saved", createdAt: new Date(time + 1500).toISOString() }], userInputRequest: null }); });
  await waitFor(() => expect(onRunStateChange.mock.calls.at(-1)?.[0]).toMatchObject({ active: false, loading: false }));
  await waitFor(() => expect(screen.getByText("Soul saved")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  expect(view.container.querySelectorAll('[data-history-interaction-id="question"]')).toHaveLength(1);
  await waitFor(() => expect(view.container.querySelectorAll('.ef-chat__rail-summary[aria-expanded]')).toHaveLength(2));
  view.container.querySelectorAll('.ef-chat__rail-summary[aria-expanded]').forEach(button => fireEvent.click(button));
  const persistedTool = view.container.querySelector('[data-work-item-id="save-tool"]')!;
  expect(persistedTool).toBeTruthy();
  expect(view.container.querySelector('[data-history-interaction-id="question"]')!.compareDocumentPosition(persistedTool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  view.unmount();
  const restored = render(<ChatRuntimeWindow {...props} />);
  await waitFor(() => expect(screen.getByText("Soul saved")).toBeTruthy());
  expect(restored.container.querySelectorAll('[data-history-interaction-id="question"]')).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  expect(props.onError).not.toHaveBeenCalled();
});
