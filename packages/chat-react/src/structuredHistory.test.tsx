// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatAdapter, ChatSession, SessionHistory } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";
const session: ChatSession = { id: 1, sessionId: "S", title: "History", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
function page(sessionId = "S", name = "Durable answer"): SessionHistory {
  return { sessionId, version: "v1", nextCursor: null, activeRuns: [], pendingInteractions: [],
    runs: [{ id: "R", sessionId, parentRunId: null, rootRunId: "R", status: "Completed", startedAtMs: 1, finishedAtMs: 2, error: null }],
    records: { messages: [
      { id: "U", runId: "R", stepId: null, role: "User", content: [{ type: "Text", text: "Original user" }], structured: null, status: "Completed", createdAtMs: 1 },
      { id: "A", runId: "R", stepId: "STEP", role: "Assistant", content: [{ type: "Text", text: name }, { type: "Reasoning", text: "Actual reasoning" }, { type: "Json", value: { public: true } }, { type: "Resource", uri: "artifact://report", mimeType: "text/plain", name: "report.txt", sizeBytes: 12 }], structured: null, status: "Completed", createdAtMs: 2 },
    ], steps: [{ id: "STEP", runId: "R", nodeInvocationId: null, sequence: 1, attempt: 2, name: "model", model: null, status: "Completed", usage: { inputTokens: 1, outputTokens: 2 }, startedAtMs: 1, finishedAtMs: 2 }],
    toolInvocations: [{ id: "TOOL", runId: "R", stepId: "STEP", messageId: "A", callId: "call", toolId: "lookup", toolName: "lookup", arguments: { q: "query" }, status: "Unknown", content: [], structured: null, isError: null, resultReference: null, startedAtMs: 1, finishedAtMs: null }], interactions: [] },
  };
}
function host(): ChatAdapter { return {
  capabilities: { supportsAbort: true, supportsStreaming: true, supportsAgui: true, supportsProtocolReplay: true },
  createSession: vi.fn(), streamMessage: vi.fn(), loadMessages: vi.fn().mockRejectedValue(new Error("replay forbidden")), loadAguiEvents: vi.fn().mockRejectedValue(new Error("replay forbidden")), loadProtocolEvents: vi.fn().mockRejectedValue(new Error("replay forbidden")), loadHistory: vi.fn().mockResolvedValue(page()),
}; }
beforeEach(() => { ensureTestLocalStorage(); Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); });
afterEach(() => { cleanup(); window.localStorage.clear(); });
it("reads one structured snapshot and renders records without any event replay", async () => {
  const adapter = host();
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{ floating: false }} onError={vi.fn()} />);
  expect(await screen.findByText("Durable answer")).toBeTruthy();
  expect(screen.getByText(/Step 1 · Attempt 2/)).toBeTruthy();
  expect(screen.getAllByText(/Result unknown/).length).toBeGreaterThan(0);
  expect(screen.queryByText("Ran lookup")).toBeNull();
  expect(screen.getByText('"public": true', { exact: false })).toBeTruthy();
  expect(screen.getByText("report.txt")).toBeTruthy();
  expect(adapter.loadMessages).not.toHaveBeenCalled(); expect(adapter.loadAguiEvents).not.toHaveBeenCalled(); expect(adapter.loadProtocolEvents).not.toHaveBeenCalled();
});
it("shows loading immediately and ignores a late response from a previous session", async () => {
  const adapter=host(); let resolve!: (value: SessionHistory)=>void;
  vi.mocked(adapter.loadHistory!).mockReturnValueOnce(new Promise((accept)=>{resolve=accept;})).mockResolvedValue(page("NEXT", "New session answer"));
  const config={floating:false}; const onError=vi.fn();
  const view=render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={config} onError={onError} />);
  expect(screen.getByRole("status").textContent).toContain("Loading history");
  view.rerender(<ChatRuntimeWindow adapter={adapter} initialSession={{...session,sessionId:"NEXT"}} config={config} onError={onError} />);
  expect(await screen.findByText("New session answer")).toBeTruthy();
  await act(async()=>resolve(page()));
  expect(screen.queryByText("Durable answer")).toBeNull();
});
it("reloads one consistent newest page when an older-page cursor expires", async () => {
  const adapter=host(); const first=page();first.nextCursor={sessionId:"S",version:"v1",before:1};
  vi.mocked(adapter.loadHistory!).mockResolvedValueOnce(first).mockRejectedValueOnce(Object.assign(new Error("changed"),{status:409})).mockResolvedValueOnce({...page("S","Newest answer"),version:"v2"});
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating:false}} onError={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button",{name:"Load earlier turns"}));
  expect(await screen.findByText("Newest answer")).toBeTruthy();
  expect(screen.queryByText("Durable answer")).toBeNull();
  expect(adapter.loadHistory).toHaveBeenLastCalledWith("S",{limit:20,cursor:null});
});
it.each(["R", "goal:R"])("replaces live output with the same durable identity after completion (%s)", async (protocolRunId) => {
  const adapter=host(); vi.mocked(adapter.loadHistory!).mockResolvedValueOnce({...page(),runs:[],records:{steps:[],messages:[],toolInvocations:[],interactions:[]}}).mockResolvedValue(page());
  vi.mocked(adapter.streamMessage).mockImplementation(async (_s,_input,handlers)=>{
    const identity = { threadId:"S", runId:protocolRunId, metadata:{framework:{runId:"R"}} };
    handlers?.onAguiEvent?.({...identity,type:"RUN_STARTED"});
    handlers?.onAguiEvent?.({...identity,type:"TEXT_MESSAGE_START",messageId:"A",role:"assistant"});
    handlers?.onAguiEvent?.({...identity,type:"TEXT_MESSAGE_CONTENT",messageId:"A",delta:"Durable answer"});
    handlers?.onAguiEvent?.({...identity,type:"TEXT_MESSAGE_END",messageId:"A"});
    handlers?.onAguiEvent?.({...identity,type:"RUN_FINISHED"});
    return {session, messages:[], run:{runId:"R",status:"COMPLETED",finalOutput:"Durable answer",stepCount:1}};
  });
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating:false}} onError={vi.fn()} />);
  await waitFor(()=>expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"Question"}}); fireEvent.click(screen.getByRole("button",{name:"Send"}));
  await waitFor(()=>expect(document.querySelector('[data-history-message-id="A"]')).not.toBeNull());
  expect(screen.getAllByText("Durable answer")).toHaveLength(1);
});
