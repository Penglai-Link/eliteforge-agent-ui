// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatAdapter, ChatAguiEvent, ChatAguiStreamEvent, ChatMessage, ChatSession } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";

beforeEach(() => {
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
});
afterEach(() => {cleanup();window.localStorage.clear();vi.restoreAllMocks();});
it("keeps successful history and canonical subtotal visible when protocol replay fails, without reporting execution failed", async () => {
  const startedAt=Date.now()-1000;
  const audit: ChatAguiEvent={id:"AUDIT",type:"agent.model.usage",eventName:"agent.model.usage",runId:"RUN",streamKey:"SESSION",occurredAt:new Date(startedAt).toISOString(),outcome:"SUCCESS",metadata:{usage_audit_json:'{"actual":{"totalTokens":12}}'}};
  const onError=vi.fn();
  const onRunStateChange=vi.fn();
  const adapter:ChatAdapter={
    capabilities:{supportsAbort:true,supportsStreaming:true,supportsAgui:true,supportsProtocolReplay:true,supportsActiveRun:true},
    createSession:vi.fn(),deleteSession:vi.fn(),streamMessage:vi.fn(),
    loadMessages:vi.fn().mockResolvedValue([{id:1,messageId:"USER",sessionId:"SESSION",role:"USER",actor:"User",channel:"MAIN_AGENT",content:"Historical user message",createdAt:new Date(startedAt).toISOString()}]),
    loadAguiEvents:vi.fn().mockResolvedValue([audit]),
    loadProtocolEvents:vi.fn().mockRejectedValue(new Error("Presentation replay is incomplete")),
    getActiveRun:vi.fn().mockResolvedValue({sessionId:"SESSION",activeRun:null}),
  };
  render(<ChatRuntimeWindow adapter={adapter} config={{floating:false,workRailLabels:{ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:()=>"Done",workingFor:()=>"Executing",failed:"Run failed",notices:{presentationIncomplete:"展示回放不完整",presentationIncompleteDetail:"执行结果会单独报告"}}}}
    initialSession={{id:1,sessionId:"SESSION",title:"History",status:"ACTIVE",createdAt:new Date(startedAt).toISOString(),updatedAt:new Date(startedAt).toISOString()}}
    onError={onError} onRunStateChange={onRunStateChange}/>);
  expect((await screen.findAllByText("Historical user message")).some((element) => element.classList.contains("ef-chat__message-body"))).toBe(true);
  expect(await screen.findByText("展示回放不完整")).toBeTruthy();
  expect(audit.metadata.usage_audit_json).toBe('{"actual":{"totalTokens":12}}');
  await waitFor(()=>expect(onError).toHaveBeenCalledWith("Presentation replay is incomplete","Chat load failed"));
  expect(onError).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Run failed/)).toBeNull();
  expect(screen.queryByText("Executing")).toBeNull();
  expect(onRunStateChange.mock.calls.every(([state])=>state.active===false)).toBe(true);
});


it.each(["healthy", "native-error", "explicit-incomplete", "no-terminal"] as const)(
  "recovers a transient post-turn replay read without losing live evidence: %s",
  async (mode) => {
    const session: ChatSession = { id: 1, sessionId: "SESSION", title: "Input", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const onError = vi.fn();
    const intervals = new Map<number, () => void | Promise<void>>();
    let nextIntervalId = 0;
    vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      const id = ++nextIntervalId;
      intervals.set(id, callback as () => void | Promise<void>);
      return id;
    });
    vi.spyOn(window, "clearInterval").mockImplementation((id) => {
      if (id !== undefined) intervals.delete(id);
    });
    let afterTurn = false;
    let failNextReplay = false;
    let recovered = false;
    const messages: ChatMessage[] = [];
    const base = { runId: "RUN", threadId: "SESSION", timestamp: Date.now() + 100 };
    const started: ChatAguiStreamEvent = { ...base, type: "RUN_STARTED" };
    const terminal: ChatAguiStreamEvent = { ...base, type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [{ id: "INPUT", reason: "approval_required", message: "Continue?", responseSchema: { type: "boolean" } }] } };
    const evidence: ChatAguiStreamEvent[] = mode === "native-error"
      ? [{ ...base, type: "RUN_ERROR", code: "AGUI_STREAM_OVERFLOW", message: "Output overflow" }]
      : mode === "explicit-incomplete" ? [{ ...terminal, presentationIncomplete: true }] : [];
    const adapter: ChatAdapter = {
      capabilities: { supportsAbort: true, supportsStreaming: true, supportsAgui: true, supportsProtocolReplay: true, supportsUserInputRequests: true },
      createSession: vi.fn(), deleteSession: vi.fn(),
      loadMessages: vi.fn(async () => [...messages]),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadUserInputRequests: vi.fn().mockResolvedValue([]),
      loadProtocolEvents: vi.fn(async () => {
        if (failNextReplay) { failNextReplay = false; throw new Error("Temporary replay read failure"); }
        if (!afterTurn) return [];
        if (!recovered) return [started];
        return mode === "no-terminal" ? [started] : [started, terminal];
      }),
      streamMessage: vi.fn(async (_session, _input, handlers) => {
        base.timestamp = Date.now();
        started.timestamp = terminal.timestamp = base.timestamp;
        for (const event of evidence) event.timestamp = base.timestamp;
        afterTurn = true;
        failNextReplay = true;
        messages.push({ id: 1, messageId: "USER", sessionId: "SESSION", runId: "RUN", role: "USER", actor: "User", channel: "MAIN_AGENT", content: "Ask for the next step", createdAt: new Date(base.timestamp!).toISOString() });
        for (const event of [started, ...evidence,
          { ...base, type: "REASONING_MESSAGE_START", messageId: "LIVE" },
          { ...base, type: "REASONING_MESSAGE_CONTENT", messageId: "LIVE", delta: "Unpersisted live evidence." },
          { ...base, type: "REASONING_MESSAGE_END", messageId: "LIVE" }, terminal,
        ] as ChatAguiStreamEvent[]) handlers?.onAguiEvent?.(event);
        return { session, run: { runId: "RUN", status: "AWAITING_USER_INPUT" as const, finalOutput: "", stepCount: 1 }, messages: [...messages], userInputRequest: null };
      }),
    };
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false, workRailLabels: { ariaLabel: "Work", preparing: "Preparing", responding: "Responding", thinking: "Thinking", workedFor: () => "Done", workingFor: () => "Executing", failed: "Run failed", notices: { presentationIncomplete: "展示回放不完整", presentationIncompleteDetail: "执行结果会单独报告" } } }} initialSession={session} onError={onError} />);
    await waitFor(() => expect(adapter.loadProtocolEvents).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ask for the next step" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(await screen.findByText("展示回放不完整")).toBeTruthy();
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Temporary replay read failure", "Chat load failed"));
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    const work = screen.getByRole("button", { name: /^(Done|Executing)/ });
    if (work.getAttribute("aria-expanded") !== "true") fireEvent.click(work);
    expect(screen.getByText("Unpersisted live evidence.")).toBeTruthy();
    recovered = true;
    const replayReads = vi.mocked(adapter.loadProtocolEvents!).mock.calls.length;
    expect(intervals.size).toBeGreaterThan(0);
    await act(async () => {
      await Promise.all([...intervals.values()].map(async (callback) => { await callback(); }));
    });
    expect(vi.mocked(adapter.loadProtocolEvents!).mock.calls.length).toBeGreaterThan(replayReads);
    await waitFor(() => {
      if (mode === "healthy") expect(screen.queryByText("展示回放不完整")).toBeNull();
      else expect(screen.getByText("展示回放不完整")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    const recoveredWork = screen.getByRole("button", { name: /^(Done|Executing)/ });
    if (recoveredWork.getAttribute("aria-expanded") !== "true") fireEvent.click(recoveredWork);
    expect(screen.getByText("Unpersisted live evidence.")).toBeTruthy();
    expect(adapter.streamMessage).toHaveBeenCalledTimes(1);
  },
);
