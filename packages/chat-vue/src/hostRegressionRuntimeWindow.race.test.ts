// @vitest-environment jsdom

import {
  type ChatAdapter,
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
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = defineComponent({
    setup() {
      return () =>
        h(ChatRuntimeWindow, {
          adapter,
          config: { floating: false, workspaceCode: "WS-1" },
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
