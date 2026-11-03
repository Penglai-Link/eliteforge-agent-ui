// @vitest-environment jsdom

import {
  ChatAdapterError,
  type ChatAdapter,
  type ChatClientConfig,
  type ChatSendResult,
  type ChatSession,
  type ChatStreamHandlers,
  type SendChatMessageInput,
} from "@eliteforge/agent-ui-chat-core";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";

const mountedApps: Array<{ app: App; container: HTMLElement }> = [];

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  for (const { app, container } of mountedApps.splice(0)) {
    app.unmount();
    container.remove();
  }
});

function restoredSession(
  sessionId = "SESSION-FIRST",
  id = 1,
): ChatSession {
  return {
    displayName: "Main Agent",
    appCode: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    id,
    lastRunCode: null,
    lastRunStatus: null,
    sessionId,
    status: "ACTIVE",
    systemAgentSessionId: null,
    taskCode: null,
    title: sessionId,
    updatedAt: "2026-07-17T00:00:00.000Z",
    userCode: "user-1",
  };
}

function completedResult(
  runId: string,
  activeSession: ChatSession,
): ChatSendResult {
  return {
    messages: [],
    run: {
      finalOutput: "done",
      runId,
      status: "COMPLETED",
      stepCount: 1,
    },
    session: {
      ...activeSession,
      lastRunCode: runId,
      lastRunStatus: "COMPLETED",
    },
  };
}

function mountRuntime(
  adapter: ChatAdapter,
  initialSession: Ref<ChatSession>,
  config: Ref<Partial<ChatClientConfig>> = ref({}),
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = defineComponent({
    setup() {
      return () =>
        h(ChatRuntimeWindow, {
          adapter,
          config: { floating: false, workspaceCode: "WS-1", ...config.value },
          initialSession: initialSession.value,
          onError: vi.fn(),
          onInfo: vi.fn(),
        });
    },
  });
  const app = createApp(root);
  app.mount(container);
  mountedApps.push({ app, container });
  return container;
}

async function flushUi() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

async function waitFor(check: () => boolean, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await flushUi();
    if (check()) return;
    await new Promise((resolve) => window.setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for Vue runtime state");
}

async function submit(
  container: HTMLElement,
  content: string,
  label: "Queue" | "Send",
) {
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("Composer textarea not found");
  textarea.value = content;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  if (label === "Queue") {
    textarea.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }));
    await flushUi();
    return;
  }
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`${label} button not found`);
  button.click();
  await flushUi();
}

describe("Vue ChatRuntimeWindow stream races", () => {
  it("ignores detached callbacks and a stale result without releasing the new owner", async () => {
    const firstSession = restoredSession();
    const secondSession = restoredSession("SESSION-SECOND", 2);
    const currentSession = ref(firstSession);
    const pending: Array<{
      handlers: ChatStreamHandlers;
      resolve: (result: ChatSendResult) => void;
      session: ChatSession;
      signal?: AbortSignal;
    }> = [];
    const loadMessages = vi.fn().mockResolvedValue([]);
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsAgui: true,
        supportsProtocolReplay: false,
        supportsSteer: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages,
      streamMessage: vi.fn(
        (
          session: ChatSession,
          _input: SendChatMessageInput,
          handlers: ChatStreamHandlers,
          signal?: AbortSignal,
        ) =>
          new Promise<ChatSendResult>((resolve) => {
            pending.push({ handlers, resolve, session, signal });
          }),
      ),
    };
    const container = mountRuntime(adapter, currentSession);

    await waitFor(() => loadMessages.mock.calls.length > 0);
    await submit(container, "First run", "Send");
    await waitFor(() => pending.length === 1);

    currentSession.value = secondSession;
    await waitFor(() => pending[0].signal?.aborted === true);
    await waitFor(() => container.textContent?.includes("SESSION-SECOND") === true);
    await submit(container, "Second run", "Send");
    await waitFor(() => pending.length === 2);

    pending[0].handlers.onAguiEvent?.({
      runId: "RUN-STALE",
      supportsSteer: true,
      type: "RUN_STARTED",
    });
    pending[0].handlers.onDelta?.("stale delta");
    pending[0].resolve(completedResult("RUN-STALE", firstSession));
    await flushUi();

    expect(container.textContent).toContain("SESSION-SECOND");
    expect(container.textContent).not.toContain("stale delta");
    expect(container.querySelector('button[aria-label="Steer"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Queue"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Send"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Stop"]')).not.toBeNull();
  });

  it("consumes the stopped active item and pauses the remaining queue", async () => {
    const activeSession = restoredSession();
    const currentSession = ref(activeSession);
    const pending: Array<{
      input: SendChatMessageInput;
      resolve: (result: ChatSendResult) => void;
    }> = [];
    const streamMessage = vi.fn(
      (
        session: ChatSession,
        input: SendChatMessageInput,
        _handlers: ChatStreamHandlers,
        signal?: AbortSignal,
      ) =>
        new Promise<ChatSendResult>((resolve) => {
          pending.push({ input, resolve });
          signal?.addEventListener(
            "abort",
            () => resolve(completedResult(`RUN-${pending.length}`, session)),
            { once: true },
          );
        }),
    );
    const loadMessages = vi.fn().mockResolvedValue([]);
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages,
      streamMessage,
    };
    const container = mountRuntime(adapter, currentSession);

    await waitFor(() => loadMessages.mock.calls.length > 0);
    await submit(container, "First", "Send");
    await waitFor(() => pending.length === 1);
    await submit(container, "Second", "Queue");
    await submit(container, "Third", "Queue");

    pending[0].resolve(completedResult("RUN-FIRST", activeSession));
    await waitFor(() => pending.length === 2);
    expect(pending[1].input.content).toBe("Second");

    const stop = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop"]',
    );
    if (!stop) throw new Error("Stop button not found");
    stop.click();
    await waitFor(
      () =>
        Array.from(
          container.querySelectorAll(".ef-chat__queued-message-content"),
        )
          .map((element) => element.textContent)
          .join("|") === "Third",
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    await flushUi();

    expect(streamMessage).toHaveBeenCalledTimes(2);
  });
});


it("retains explicit skills through send, steer, queued editing and refreshed suggestions", async () => {
  const session = restoredSession();
  const config = ref<Partial<ChatClientConfig>>({ inputSuggestions: [{ kind: "skill", name: "review" }] });
  const pending: Array<{ input: SendChatMessageInput; handlers?: ChatStreamHandlers; resolve: (result: ChatSendResult) => void }> = [];
  const steerMessage = vi.fn().mockResolvedValue({ sessionId: session.sessionId, runId: "RUN-SELECTED", message: {
    id: 44, messageId: "steer-selected", sessionId: session.sessionId, runId: "RUN-SELECTED", role: "USER", channel: "conversation", content: "$review adjust", createdAt: session.createdAt,
  } });
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true, supportsSteer: true, supportsAgui: true },
    createSession: vi.fn(), loadMessages: vi.fn().mockResolvedValue([]), loadAguiEvents: vi.fn().mockResolvedValue([]), steerMessage,
    streamMessage: vi.fn((_session, input, handlers) => new Promise(resolve => pending.push({ input, handlers, resolve }))),
  };
  const container = mountRuntime(adapter, ref(session), config);
  await flushUi();
  await submit(container, "$review send", "Send");
  await waitFor(() => pending.length === 1);
  expect(pending[0].input.requestedSkills).toEqual(["review"]);
  pending[0].handlers?.onAguiEvent?.({ type: "RUN_STARTED", runId: "RUN-SELECTED" });
  await flushUi();
  const textarea = container.querySelector("textarea")!;
  textarea.value = "$review adjust";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  await waitFor(() => steerMessage.mock.calls.length === 1);
  expect(steerMessage.mock.calls[0][1].requestedSkills).toEqual(["review"]);
  await submit(container, "$review next", "Queue");
  await waitFor(() => Boolean(container.querySelector('[aria-label="Edit queued message"]')));
  config.value = { inputSuggestions: [] };
  await flushUi();
  container.querySelector<HTMLButtonElement>('[aria-label="Edit queued message"]')!.click();
  await flushUi();
  await submit(container, "$review edited", "Queue");
  pending[0].resolve(completedResult("RUN-SELECTED", session));
  await waitFor(() => pending.length === 2);
  expect(pending[1].input.requestedSkills).toEqual(["review"]);
  expect(pending[1].input.content).toBe("$review edited");
  pending[1].resolve(completedResult("RUN-QUEUED", session));
  await flushUi();
});

it("preserves explicitly rejected queued selections for editing after grants refresh", async () => {
  const session = restoredSession();
  let finish: (result: ChatSendResult) => void = () => undefined;
  const streamMessage = vi.fn().mockImplementationOnce(() => new Promise<ChatSendResult>(resolve => { finish = resolve; }))
    .mockRejectedValue(new ChatAdapterError("Skill access revoked", { code: "101032002", rejectedBeforeAdmission: true }));
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true, supportsAgui: true }, createSession: vi.fn(),
    loadMessages: vi.fn().mockResolvedValue([]), loadAguiEvents: vi.fn().mockResolvedValue([]), streamMessage,
  };
  const config = ref<Partial<ChatClientConfig>>({ inputSuggestions: [{ kind: "skill", name: "review" }] });
  const container = mountRuntime(adapter, ref(session), config);
  await flushUi();
  await submit(container, "first", "Send");
  await waitFor(() => streamMessage.mock.calls.length === 1);
  await submit(container, "$review next", "Queue");
  config.value = { inputSuggestions: [] };
  finish(completedResult("RUN-FIRST", session));
  await waitFor(() => streamMessage.mock.calls.length === 2);
  await waitFor(() => Boolean(container.querySelector('[aria-label="Edit queued message"]')));
  expect(streamMessage.mock.calls[1][1].requestedSkills).toEqual(["review"]);
  container.querySelector<HTMLButtonElement>('[aria-label="Edit queued message"]')!.click();
  await flushUi();
  expect(container.querySelector("textarea")!.value).toBe("$review next");
  await submit(container, "$review edited", "Send");
  await waitFor(() => streamMessage.mock.calls.length === 3);
  expect(streamMessage.mock.calls[2][1].requestedSkills).toEqual(["review"]);
});

it("restores saved explicit skill identities when editing history without suggestions", async () => {
  const session = restoredSession();
  const streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-EDIT", session));
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true }, createSession: vi.fn(), streamMessage,
    loadMessages: vi.fn().mockResolvedValue([{ id: 1, messageId: "saved-selection", sessionId: session.sessionId, role: "USER", channel: "MAIN_AGENT", content: "$review saved", requestedSkills: ["review"], createdAt: session.createdAt }]),
  };
  const container = mountRuntime(adapter, ref(session));
  await waitFor(() => Boolean(container.querySelector('[aria-label="Edit message"]')));
  container.querySelector<HTMLButtonElement>('[aria-label="Edit message"]')!.click();
  await flushUi();
  await submit(container, "$review saved", "Send");
  await waitFor(() => streamMessage.mock.calls.length === 1);
  expect(streamMessage.mock.calls[0][1]).toMatchObject({ content: "$review saved", requestedSkills: ["review"] });
});

it("shows separate AG-UI step cards before completion and preserves them through settlement", async () => {
  const session = restoredSession();
  let handlers: ChatStreamHandlers | undefined;
  let finish: (result: ChatSendResult) => void = () => undefined;
  const loadMessages = vi.fn().mockResolvedValue([]);
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true, supportsAgui: true }, createSession: vi.fn(), loadMessages, loadAguiEvents: vi.fn().mockResolvedValue([]),
    streamMessage: vi.fn((_session, _input, next) => new Promise(resolve => { handlers = next; finish = resolve; })),
  };
  const container = mountRuntime(adapter, ref(session));
  await flushUi(); await submit(container, "Inspect the repository", "Send");
  await waitFor(() => Boolean(handlers));
  let sequence = 0;
  const emit = async (type: string, messageId: string, delta?: string) => {
    handlers!.onAguiEvent?.({ type, messageId, delta, runId: "RUN-STREAM", threadId: session.sessionId, metadata: { framework: { runId: "NATIVE-RUN" }, tron: { eventId: `frame:${++sequence}` } } });
    if (delta) handlers!.onDelta?.(delta);
    await flushUi();
  };
  await emit("RUN_STARTED", "");
  await emit("TEXT_MESSAGE_START", "step-first");
  await emit("TEXT_MESSAGE_CONTENT", "step-first", "First progress summary");
  container.querySelector<HTMLButtonElement>('.ef-chat__rail-summary[aria-expanded="false"]')?.click();
  await flushUi();
  const first = container.querySelector('[data-message-id="step-first"]');
  expect(first?.textContent).toContain("First progress summary");
  await emit("TEXT_MESSAGE_END", "step-first");
  expect(first?.getAttribute("data-streaming")).toBeNull();
  await emit("TEXT_MESSAGE_START", "step-second");
  await emit("TEXT_MESSAGE_CONTENT", "step-second", "Second progress summary");
  expect(container.querySelector('[data-message-id="step-first"]')).toBe(first);
  expect(first?.textContent).not.toContain("Second");
  expect(container.querySelector('[data-message-id="step-second"]')?.textContent).toContain("Second progress summary");
  await emit("TEXT_MESSAGE_END", "step-second");
  await emit("TEXT_MESSAGE_START", "step-final");
  await emit("TEXT_MESSAGE_CONTENT", "step-final", "Final answer");
  await emit("TEXT_MESSAGE_END", "step-final");
  expect(container.querySelectorAll('[data-theme-part="chat-message-assistant"]')).toHaveLength(3);
  loadMessages.mockRejectedValue(new Error("Replay unavailable"));
  const result = completedResult("RUN-STREAM", session);
  result.messages = [{ id: "product-final", messageId: "product-final", sessionId: session.sessionId, runId: "RUN-STREAM", role: "ASSISTANT", channel: "MAIN_AGENT", content: "Final answer\n\n", createdAt: new Date().toISOString() }];
  await emit("RUN_FINISHED", "");
  finish(result); await flushUi();
  const settledFirst = container.querySelector('[data-message-id="step-first"]');
  expect(settledFirst?.textContent).toContain("First progress summary");
  expect(settledFirst?.closest(".ef-chat__rail")).toBeNull();
  expect(container.querySelector('[data-message-id="step-second"]')?.closest(".ef-chat__rail")).toBeNull();
  expect(container.querySelectorAll('[data-theme-part="chat-message-assistant"]')).toHaveLength(3);
  expect(container.querySelector('[data-message-id="step-final"]')?.textContent).toContain("Final answer");
});

it("keeps phased progress in the transcript after a product completion", async () => {
  const session = restoredSession();
  let handlers: ChatStreamHandlers | undefined;
  let finish: (result: ChatSendResult) => void = () => undefined;
  const loadMessages = vi.fn().mockResolvedValue([]);
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true, supportsAgui: true }, createSession: vi.fn(),
    loadMessages, loadAguiEvents: vi.fn().mockResolvedValue([]),
    streamMessage: vi.fn((_session, _input, next) => new Promise(resolve => { handlers = next; finish = resolve; })),
  };
  const container = mountRuntime(adapter, ref(session));
  await flushUi(); await submit(container, "Inspect", "Send");
  await waitFor(() => Boolean(handlers));
  let sequence = 0;
  const emit = async (type: string, messageId: string, delta?: string, phase?: string) => {
    handlers!.onAguiEvent?.({ type, messageId, delta, runId: "RUN-PHASE", threadId: session.sessionId,
      metadata: { framework: { runId: "NATIVE-RUN", ...(phase ? { message: { phase, outputIndex: 0, stepId: "step" } } : {}) }, tron: { eventId: `phase:${++sequence}` } } });
    if (delta) handlers!.onDelta?.(delta);
    await flushUi();
  };
  await emit("RUN_STARTED", "");
  await emit("TEXT_MESSAGE_START", "progress");
  await emit("TEXT_MESSAGE_CONTENT", "progress", "Checking files");
  await emit("TEXT_MESSAGE_END", "progress", undefined, "commentary");
  await emit("TEXT_MESSAGE_START", "answer", undefined, "final_answer");
  await emit("TEXT_MESSAGE_CONTENT", "answer", "Done");
  await emit("TEXT_MESSAGE_END", "answer", undefined, "final_answer");
  handlers!.onAguiEvent?.({ type: "RUN_FINISHED", runId: "RUN-PHASE", threadId: session.sessionId,
    metadata: { framework: { runId: "NATIVE-RUN", finalMessageIds: ["answer"] }, tron: { eventId: `phase:${++sequence}` } } });
  const result = completedResult("RUN-PHASE", session);
  loadMessages.mockRejectedValue(new Error("Replay unavailable"));
  result.messages = [{ id: "product-final", messageId: "product-final", sessionId: session.sessionId, runId: "RUN-PHASE", role: "ASSISTANT", channel: "MAIN_AGENT", content: "Done", createdAt: new Date().toISOString() }];
  finish(result); await flushUi();
  expect(container.querySelector('[data-message-id="progress"]')?.textContent).toContain("Checking files");
  expect(container.querySelector('[data-message-id="answer"]')?.textContent).toContain("Done");
  expect(container.querySelector('[data-message-id="product-final"]')).toBeNull();
});

it("restores a compaction card and lock after switching sessions without stopping the run", async () => {
  const first = restoredSession();
  const second = restoredSession("SESSION-SECOND", 2);
  const selected = ref(first);
  let finished = false;
  const adapter: ChatAdapter = {
    capabilities: { supportsStreaming: true, supportsAgui: true, supportsProtocolReplay: true, supportsActiveRun: true, supportsSteer: true, supportsStop: true },
    createSession: vi.fn(), streamMessage: vi.fn(), stopRun: vi.fn(),
    loadMessages: vi.fn(async sessionId => sessionId === first.sessionId ? [{id:1,messageId:"compact-input",sessionId,role:"USER",channel:"MAIN_AGENT",content:"/compact",createdAt:new Date(0).toISOString()}] : []), loadAguiEvents: vi.fn().mockResolvedValue([]),
    getActiveRun: vi.fn(async sessionId => ({ sessionId, activeRun: sessionId === first.sessionId && !finished
      ? { runId: "COMPACT", runtimeAdapterKey: "REACT", state: "RUNNING", supportsSteer: false, operationKind: "ContextCompaction" } : null })),
    loadProtocolEvents: vi.fn().mockResolvedValue([]),
    loadHistory: vi.fn(async sessionId => {
      const owns = sessionId === first.sessionId;
      const run = {id:"COMPACT",sessionId,rootRunId:"COMPACT",parentRunId:null,status: finished ? "Completed" as const : "Running" as const,startedAtMs:1,finishedAtMs:finished?4:null,error:null};
      return {sessionId,version:"1",nextCursor:null,runs:owns?[run]:[],activeRuns:owns&&!finished?[run]:[],pendingInteractions:[],records:{steps:owns?[{id:"compact-step",runId:"COMPACT",nodeInvocationId:null,sequence:0,attempt:1,name:"framework.context.compaction",model:null,status:run.status,usage:null,startedAtMs:2,finishedAtMs:finished?3:null}]:[],toolInvocations:[],interactions:[],messages:owns?[{id:"compact-input",runId:"COMPACT",stepId:null,role:"User" as const,content:[{type:"Text" as const,text:"/compact"}],structured:null,status:"Completed" as const,createdAtMs:0}]:[]}};
    }),
  };
  const container = mountRuntime(adapter, selected, ref({ showAgui: true }));
  await waitFor(() => container.querySelector("textarea")?.disabled === true && container.textContent?.includes("Compacting context") === true);
  expect(container.querySelector('[aria-label="Stop"]')).toBeNull();
  selected.value = second;
  await waitFor(() => container.querySelector("textarea")?.disabled === false);
  selected.value = first;
  await waitFor(() => container.querySelector("textarea")?.disabled === true && container.textContent?.includes("Compacting context") === true);
  selected.value = second;
  await waitFor(() => container.querySelector("textarea")?.disabled === false);
  finished = true;
  selected.value = first;
  await waitFor(() => container.querySelector("textarea")?.disabled === false);
  const rail = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary");
  if (rail?.getAttribute("aria-expanded") === "false") { rail.click(); await flushUi(); }
  expect(container.textContent).toContain("Context compacted");
  expect(adapter.streamMessage).not.toHaveBeenCalled();
  expect(adapter.stopRun).not.toHaveBeenCalled();
  expect(adapter.loadProtocolEvents).not.toHaveBeenCalled();
});
