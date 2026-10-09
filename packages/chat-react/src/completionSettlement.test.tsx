// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatActiveRunResult, ChatAdapter, ChatAguiStreamEvent, ChatMessage, ChatSendResult, ChatSession } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

const session: ChatSession = {
  id: 1, sessionId: "SESSION-COMPLETION", title: "Completion", status: "ACTIVE",
  createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z",
};

function result(runId: string, content: string): ChatSendResult {
  const message: ChatMessage = {
    id: 2, messageId: `MESSAGE-${runId}`, sessionId: session.sessionId, role: "ASSISTANT",
    actor: "Assistant", channel: "conversation", content, runId, createdAt: new Date().toISOString(),
  };
  return {
    session: { ...session, lastRunId: runId, lastRunStatus: "COMPLETED" }, messages: [
      { ...message, id: 1, messageId: `USER-${runId}`, role: "USER", actor: "User", content: `Persisted user ${runId}` },
      message,
    ],
    run: { runId, status: "COMPLETED", finalOutput: content, stepCount: 1 },
  };
}

function adapter(): ChatAdapter {
  return {
    capabilities: { supportsAbort: true, supportsStreaming: true, supportsAgui: true, supportsProtocolReplay: true },
    createSession: vi.fn(), loadMessages: vi.fn().mockResolvedValue([]), loadAguiEvents: vi.fn().mockResolvedValue([]),
    loadProtocolEvents: vi.fn().mockResolvedValue([]), streamMessage: vi.fn(),
  };
}

beforeEach(() => {
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("completed turn settlement", () => {
  it("does not restore a finished executor from a late active-run poll", async () => {
    const host = adapter();
    const execution = deferred<ChatSendResult>();
    const oldActive = deferred<ChatActiveRunResult>();
    host.capabilities.supportsActiveRun = true;
    host.getActiveRun = vi.fn().mockResolvedValueOnce({ sessionId: session.sessionId, activeRun: null })
      .mockReturnValue(oldActive.promise);
    vi.mocked(host.streamMessage).mockImplementationOnce((_session, _input, handlers) => {
      handlers?.onAguiEvent?.({ type: "RUN_STARTED", threadId: session.sessionId, runId: "RUN-1" });
      return execution.promise;
    });
    const onRunStateChange = vi.fn();
    render(<ChatRuntimeWindow adapter={host} initialSession={session} config={{ floating: false }}
      onRunStateChange={onRunStateChange} onError={vi.fn()} />);
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Finish this" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(host.getActiveRun).toHaveBeenCalledTimes(2), { timeout: 2_000 });
    await act(async () => { execution.resolve(result("RUN-1", "Done")); });
    await waitFor(() => expect(onRunStateChange.mock.calls.at(-1)?.[0].active).toBe(false));
    await act(async () => { oldActive.resolve({ sessionId: session.sessionId,
      activeRun: { runId: "RUN-1", state: "RUNNING", runtimeAdapterKey: "REACT", supportsSteer: false } }); });
    expect(onRunStateChange.mock.calls.at(-1)?.[0].active).toBe(false);
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("releases the composer and drains the next message while replay and message reads are stalled", async () => {
    const host = adapter();
    const first = deferred<ChatSendResult>();
    const second = deferred<ChatSendResult>();
    const reads = deferred<ChatMessage[]>();
    const replay = deferred<ChatAguiStreamEvent[]>();
    vi.mocked(host.loadMessages).mockResolvedValueOnce([]).mockReturnValue(reads.promise);
    vi.mocked(host.loadProtocolEvents!).mockResolvedValueOnce([]).mockReturnValue(replay.promise);
    vi.mocked(host.streamMessage).mockImplementationOnce((_session, _input, handlers) => {
      handlers?.onAguiEvent?.({ type: "RUN_STARTED", threadId: session.sessionId, runId: "RUN-1" });
      handlers?.onDelta?.("A long reply. ".repeat(200));
      return first.promise;
    }).mockReturnValueOnce(second.promise);
    const onRunStateChange = vi.fn();
    render(<ChatRuntimeWindow adapter={host} initialSession={session} config={{ floating: false }}
      agentReplyEffect="typewriter" agentReplySpeed={1} onRunStateChange={onRunStateChange} onError={vi.fn()} />);
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(host.streamMessage).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Next message" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await act(async () => { first.resolve(result("RUN-1", "Authoritative final answer")); });
    await waitFor(() => expect(host.streamMessage).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Authoritative final answer")).toBeTruthy();
    expect(onRunStateChange.mock.calls.some(([state]) => !state.active)).toBe(true);
    await act(async () => { second.resolve(result("RUN-2", "Second final answer")); });
    await waitFor(() => expect(onRunStateChange.mock.calls.at(-1)?.[0].active).toBe(false));
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("does not let late replay from the completed turn overwrite an active next turn", async () => {
    const host = adapter();
    const oldMessages = deferred<ChatMessage[]>();
    const oldReplay = deferred<ChatAguiStreamEvent[]>();
    const next = deferred<ChatSendResult>();
    vi.mocked(host.loadMessages).mockResolvedValueOnce([]).mockReturnValueOnce(oldMessages.promise).mockResolvedValue([]);
    vi.mocked(host.loadProtocolEvents!).mockResolvedValueOnce([]).mockReturnValueOnce(oldReplay.promise).mockResolvedValue([]);
    vi.mocked(host.streamMessage).mockResolvedValueOnce(result("RUN-1", "First final answer"))
      .mockImplementationOnce((_session, _input, handlers) => {
        handlers?.onAguiEvent?.({ type: "RUN_STARTED", threadId: session.sessionId, runId: "RUN-2" });
        return next.promise;
      });
    const onRunStateChange = vi.fn();
    render(<ChatRuntimeWindow adapter={host} initialSession={session} config={{ floating: false }}
      onRunStateChange={onRunStateChange} onError={vi.fn()} />);
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("First final answer")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second still working" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(host.streamMessage).toHaveBeenCalledTimes(2));
    await act(async () => {
      oldMessages.resolve(result("RUN-1", "Stale snapshot").messages);
      oldReplay.resolve([{ type: "RUN_FINISHED", runId: "RUN-1", threadId: session.sessionId }]);
    });
    expect(screen.queryByText("Stale snapshot")).toBeNull();
    expect(screen.getAllByText("Second still working").length).toBeGreaterThan(0);
    expect(onRunStateChange.mock.calls.at(-1)?.[0]).toMatchObject({ active: true, runId: "RUN-2" });
    await act(async () => { next.resolve(result("RUN-2", "Second final answer")); });
  });
});
