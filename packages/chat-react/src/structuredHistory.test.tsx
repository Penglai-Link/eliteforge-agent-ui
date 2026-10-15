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
  expect(screen.queryByText(/Step 1 · Attempt 2/)).toBeNull();
  const work = screen.getByRole("button", { name: /Worked for/ });
  expect(work.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(work);
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
  expect(screen.getByRole("status").closest(".ef-chat__transcript-empty")?.querySelector(".ef-chat__transcript__bot")).toBeTruthy();
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

it.each(["system-trigger", "assistant-only"])("renders completed background history despite a later empty failed auxiliary run (%s)", async kind => {
  const adapter = host(); const snapshot = page("S", "dude-background-finished");
  snapshot.records.messages = snapshot.records.messages.filter(message => kind === "system-trigger" || message.role !== "User");
  if (kind === "system-trigger") { const trigger = snapshot.records.messages.find(message => message.role === "User")!; trigger.content = []; trigger.provenance = {sender:{kind:"SYSTEM",displayName:"Task reminder"},source:"TaskReminder"}; }
  snapshot.runs.push({id:"summary-failed",sessionId:"S",parentRunId:null,rootRunId:"summary-failed",status:"Failed",startedAtMs:3,finishedAtMs:4,error:"model did not return valid JSON"});
  vi.mocked(adapter.loadHistory!).mockResolvedValue(snapshot);
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating:false,disabledInput:true}} onError={vi.fn()} />);
  expect(await screen.findByText("dude-background-finished")).toBeTruthy();
  expect(document.querySelector('[data-history-message-id="A"]')).not.toBeNull();
});

it("keeps a background interaction visible when its system trigger and assistant have no text", async () => {
  const adapter=host(); const snapshot=page();
  snapshot.records.messages.forEach(message => { message.content=[]; if(message.role === "User") message.provenance={sender:{kind:"SYSTEM",displayName:"Task reminder"},source:"TaskReminder"}; });
  const interaction={id:"awaiting-background-input",runId:"R",invocationId:"TOOL",prompt:[{type:"Text" as const,text:"Proceed with background work?"}],responseSchema:{type:"boolean"},presentation:null,response:null,expiresAtMs:null};
  snapshot.records.interactions=[interaction];snapshot.pendingInteractions=[interaction];
  vi.mocked(adapter.loadHistory!).mockResolvedValue(snapshot);
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating:false,disabledInput:true}} onError={vi.fn()} />);
  expect(await screen.findByRole("button",{name:"Approve"})).toBeTruthy();
  // Tool-only history must not add a blank assistant block above the question.
  expect(document.querySelector('[data-history-message-id="A"]')).toBeNull();
});

it("restores an answered questionnaire as a user card from durable history", async () => {
  const adapter=host(), snapshot=page();
  snapshot.records.toolInvocations[0].toolName="chat_ask_user";
  snapshot.records.toolInvocations[0].structured={frameworkInteractionId:"ASK"};
  snapshot.records.interactions=[{id:"ASK",runId:"R",invocationId:"TOOL",prompt:[],responseSchema:{type:"object"},presentation:{questions:[{id:"tone",question:"Which tone?",options:[{id:"brief",label:"Keep it brief"}]}]},response:{answers:{tone:{option_id:"brief"}}},expiresAtMs:null}];
  vi.mocked(adapter.loadHistory!).mockResolvedValue(snapshot);
  const config={floating:false};
  const first=render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={config} onError={vi.fn()}/>);
  await waitFor(()=>expect(first.container.querySelector('[data-history-interaction-id="ASK"]')?.textContent).toContain("Which tone?Keep it brief"));
  first.unmount();
  const restored=render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={config} onError={vi.fn()}/>);
  await waitFor(()=>expect(restored.container.querySelectorAll('[data-history-interaction-id="ASK"]')).toHaveLength(1));
  expect(restored.container.querySelector('[data-history-interaction-id="ASK"]')?.textContent).toContain("Keep it brief");
});
it("keeps the domain expansion action in completed structured tool rows", async () => {
  const adapter = host();
  const snapshot = page();
  Object.assign(snapshot.records.toolInvocations[0], {
    toolId: "discovery_expand_tool_domain", toolName: "discovery_expand_tool_domain",
    arguments: { domainCode: "dude" }, status: "Completed", finishedAtMs: 2,
    structured: { status: "expanded", toolCount: 4 },
  });
  vi.mocked(adapter.loadHistory!).mockResolvedValue(snapshot);
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{ floating: false,
    workRailLabels: {
      ariaLabel: "Work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
      workedFor: (duration) => `Worked for ${duration}`, workingFor: (duration) => `Working for ${duration}`,
      tool: { resolveName: () => "Dude", domainExpanded: (name) => `Expand ${name} tools` },
    },
  }} onError={vi.fn()} />);
  await screen.findByText("Durable answer");
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  const tool = screen.getByRole("button", { name: "Expand Dude tools" });
  expect(tool).toBeTruthy();
  fireEvent.click(tool);
  expect(screen.getByRole("button", { name: "Expand Dude tools" }).getAttribute("aria-expanded")).toBe("true");
});
it("reports loading while restoring history, then reports the authoritative idle state", async () => {
  const adapter = host();
  let resolve!: (history: SessionHistory) => void;
  vi.mocked(adapter.loadHistory!).mockReturnValue(new Promise((accept) => { resolve = accept; }));
  const onRunStateChange = vi.fn();
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{ floating: false }} onRunStateChange={onRunStateChange} onError={vi.fn()} />);
  expect(onRunStateChange.mock.lastCall?.[0]).toMatchObject({ loading: true, active: false });
  await act(async () => resolve(page()));
  expect(onRunStateChange.mock.lastCall?.[0]).toMatchObject({ loading: false, active: false, sessionId: "S" });
});

it("restores native annotation metadata when reopening a historical conversation", async () => {
  const adapter = host();
  const snapshot = page("S", "[Annotation 1](#chat-annotation-a-native) Answer");
  const annotation = {id: "a-native", messageId: "source-native", selectedText: "Original quote", comment: "Saved comment"};
  snapshot.records.messages[0].annotations = [annotation];
  snapshot.records.messages.unshift({id: "source-native", runId: "R", stepId: null, role: "Assistant", content: [{type: "Text", text: "Original quote"}], structured: null, status: "Completed", createdAtMs: 0, annotations: []});
  vi.mocked(adapter.loadHistory!).mockImplementation(async () => JSON.parse(JSON.stringify(snapshot)));
  const view = render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating: false}} onError={vi.fn()} />);
  await screen.findByText("Original user", {selector: '.ef-chat__message-body'});
  view.unmount();
  render(<ChatRuntimeWindow adapter={adapter} initialSession={session} config={{floating: false}} onError={vi.fn()} />);
  const citation = await screen.findByRole('button', {name: 'Annotation 1'});
  expect(document.querySelector('.ef-chat__message-body')?.textContent).toBe('Original user');
  fireEvent.mouseOver(citation);
  expect(screen.getByRole('tooltip').textContent).toContain('Original quote');
  expect(screen.getByRole('tooltip').textContent).toContain('Saved comment');
  expect(adapter.loadMessages).not.toHaveBeenCalled();
  expect(adapter.loadProtocolEvents).not.toHaveBeenCalled();
});
