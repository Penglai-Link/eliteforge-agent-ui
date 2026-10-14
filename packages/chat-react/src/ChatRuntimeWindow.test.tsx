// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  ChatAdapterError,
  type ChatActiveRun,
  type ChatAdapter,
  type ChatSendResult,
  type ChatSession,
  type ChatStreamHandlers,
  type SendChatMessageInput,
} from "@eliteforge/agent-ui-chat-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureTestLocalStorage } from "./testLocalStorage";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

function createAdapter() {
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
    streamMessage: vi.fn(),
  };

  return { adapter, loadMessages };
}

function restoredSession(): ChatSession {
  return {
    createdAt: "2026-06-10T00:00:00.000Z",
    id: 1,
    lastRunId: null,
    lastRunStatus: null,
    sessionId: "SESSION-RESTORED",
    status: "ACTIVE",
    title: "Restored session",
    updatedAt: "2026-06-10T00:00:00.000Z",
    userId: "user-1",
  };
}

function completedResult(
  runId: string,
  activeSession: ChatSession = restoredSession(),
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
      lastRunId: runId,
      lastRunStatus: "COMPLETED",
    },
  };
}

describe("draft session admission", () => {
  it.each([false, true])("renders a draft composer (floating=%s), then creates and sends on the first valid submission", async (floating) => {
    const { adapter } = createAdapter();
    adapter.createSession = vi.fn().mockResolvedValue(restoredSession());
    adapter.streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-1"));
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating }} allowDraftSession onError={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(screen.queryByText("No session selected")).toBeNull();
    expect(adapter.createSession).not.toHaveBeenCalled();
    expect(adapter.loadMessages).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(adapter.createSession).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Review this" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(adapter.streamMessage).toHaveBeenCalledTimes(1));
    expect(adapter.createSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adapter.streamMessage).mock.calls[0][1].content).toBe("Review this");
  });

  it("locks concurrent first submissions while session creation is pending", async () => {
    let resolveCreation!: (session: ChatSession) => void;
    const { adapter } = createAdapter();
    adapter.createSession = vi.fn(() => new Promise(resolve => { resolveCreation = resolve; }));
    adapter.streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-1"));
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} allowDraftSession onError={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Review" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(adapter.createSession).toHaveBeenCalledTimes(1);
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => { resolveCreation(restoredSession()); });
    await waitFor(() => expect(adapter.streamMessage).toHaveBeenCalledTimes(1));
  });

  it("preserves the draft and reports one error when creation fails, then allows retry", async () => {
    const { adapter } = createAdapter();
    const onError = vi.fn();
    adapter.createSession = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(restoredSession());
    adapter.streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-1"));
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} allowDraftSession onError={onError} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Retry me" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith("offline", "Chat send failed"));
    expect((input as HTMLTextAreaElement).value).toBe("Retry me");
    expect(adapter.streamMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(adapter.streamMessage).toHaveBeenCalledTimes(1));
    expect(adapter.createSession).toHaveBeenCalledTimes(2);
  });

  it("lets a host stage pasted files without creating a session", async () => {
    const { adapter } = createAdapter();
    const onPasteAttachment = vi.fn();
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} allowDraftSession onPasteAttachment={onPasteAttachment} onError={vi.fn()} />);
    const file = new File(["image"], "image.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }], getData: () => "" } });
    await waitFor(() => expect(onPasteAttachment).toHaveBeenCalledWith(file));
    expect(adapter.createSession).not.toHaveBeenCalled();
  });
});

describe("ChatRuntimeWindow", () => {
  it.each(["inline", "external"] as const)("keeps streamed run errors in history with %s feedback", async (errorDisplay) => {
    const onError = vi.fn();
    const adapter: ChatAdapter = {
      ...createAdapter().adapter,
      capabilities: { supportsAbort: true, supportsAgui: true, supportsProtocolReplay: true, supportsStreaming: true },
      loadProtocolEvents: vi.fn().mockResolvedValue([]),
      streamMessage: vi.fn(async (_sessionId: string, _input: SendChatMessageInput, handlers: ChatStreamHandlers = {}) => {
        const base = { runId: "RUN-ERROR", threadId: "SESSION-RESTORED", timestamp: Date.now() };
        handlers.onAguiEvent?.({ ...base, type: "RUN_STARTED" });
        handlers.onAguiEvent?.({ ...base, type: "RUN_ERROR", code: "model_unavailable", message: "Model is unavailable" });
        throw new ChatAdapterError("Model is unavailable", { code: "model_unavailable", status: 200 });
      }),
    };
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} initialSession={restoredSession()} onError={onError} errorDisplay={errorDisplay} />);
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Inspect context" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Model is unavailable"));
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText(/^Run failed ·/)).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("renders actionable admission feedback without inventing an executed run when rejected before RUN_STARTED", async () => {
    const onError = vi.fn();
    const adapter: ChatAdapter = {
      ...createAdapter().adapter,
      capabilities: { supportsAbort: true, supportsAgui: true, supportsProtocolReplay: true, supportsStreaming: true },
      loadProtocolEvents: vi.fn().mockResolvedValue([]),
      streamMessage: vi.fn().mockRejectedValue(new ChatAdapterError(
        "Person-AI authorization is required",
        { code: "MODEL_PROVIDER_AUTH_REQUIRED", status: 409 },
      )),
    };
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} initialSession={restoredSession()} onError={onError} />);
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Who are you?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toContain("Person-AI authorization is required");
    expect(screen.queryByText(/^Run failed ·/)).toBeNull();
    expect(screen.queryByText(/Working for/)).toBeNull();
    expect(onError).toHaveBeenCalledWith("Person-AI authorization is required", "Chat send failed");
    expect(screen.queryByText("Waiting for assistant output...")).toBeNull();
  });

  it("reports admission failures externally without inserting composer feedback", async () => {
    const onError = vi.fn();
    const adapter = createAdapter().adapter;
    adapter.streamMessage = vi.fn().mockRejectedValue(new ChatAdapterError("workspaceCode is required", { code: "CHAT_WORKSPACE_REQUIRED", status: 400 }));
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false }} initialSession={restoredSession()} onError={onError} errorDisplay="external" />);
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith("workspaceCode is required", "Chat send failed"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("workspaceCode is required")).toBeNull();
  });

  it("shows pending images as thumbnails and files with name and type, then clears them after send", async () => {
    const uploadedAttachments = [
      {
        contentType: "image/png",
        fileName: "screen.png",
        id: "IMAGE-1",
        imageUrl: "data:image/png;base64,AA==",
        kind: "image" as const,
        metadata: {},
        summary: "screen.png",
      },
      {
        contentType: "application/pdf",
        fileName: "guide.pdf",
        id: "FILE-1",
        kind: "file" as const,
        metadata: {},
        summary: "guide.pdf",
      },
    ];
    const streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-ATTACHMENTS"));
    const adapter = {
      ...createAdapter().adapter,
      streamMessage,
      uploadAttachment: vi.fn()
        .mockResolvedValueOnce(uploadedAttachments[0])
        .mockResolvedValueOnce(uploadedAttachments[1]),
    } satisfies ChatAdapter;
    const { container } = render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    function fileList(file: File): FileList {
      return {
        0: file,
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      } as FileList;
    }
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: fileList(new File(["image"], "screen.png", { type: "image/png" })) },
    });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: fileList(new File(["pdf"], "guide.pdf", { type: "application/pdf" })) },
    });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "screen.png" })).toBeTruthy();
      expect(screen.getByText("guide.pdf")).toBeTruthy();
      expect(screen.getByText("PDF")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove guide.pdf" }));
    expect(screen.queryByText("guide.pdf")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
      expect.objectContaining({ attachments: [uploadedAttachments[0]] }),
      expect.anything(),
      expect.anything(),
    ));
    await waitFor(() => expect(screen.queryByRole("img", { name: "screen.png" })).toBeNull());
  });

  it("uploads an image pasted into the composer", async () => {
    const pastedAttachment = {
      contentType: "image/png",
      fileName: "pasted.png",
      id: "IMAGE-PASTED",
      imageUrl: "data:image/png;base64,AA==",
      kind: "image" as const,
      metadata: {},
      summary: "pasted.png",
    };
    const uploadAttachment = vi.fn().mockResolvedValue(pastedAttachment);
    const adapter = {
      ...createAdapter().adapter,
      uploadAttachment,
    } satisfies ChatAdapter;
    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const file = new File(["image"], "clipboard.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        items: [{
          getAsFile: () => file,
          kind: "file",
          type: "image/png",
        }],
      },
    });

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
      expect.objectContaining({
        file,
        kind: "image",
        summary: "clipboard.png",
      }),
    ));
    expect(screen.getByRole("img", { name: "pasted.png" })).toBeTruthy();
  });

  it("synchronizes a later initialSession value into the runtime state", async () => {
    const { adapter, loadMessages } = createAdapter();
    const { rerender } = render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
      />,
    );

    expect(screen.getByText("No session selected")).toBeTruthy();

    rerender(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => {
      expect(loadMessages).toHaveBeenCalledWith("SESSION-RESTORED");
    });

    expect(screen.queryByText("No session selected")).toBeNull();
    expect(screen.getByText((content) => content.includes("SESSION-RESTORED"))).toBeTruthy();
    expect(screen.queryByText("No persisted messages in this session.")).toBeNull();
  });

  it("does not download a previous session's attachment while loading the next session", async () => {
    const firstSession = restoredSession();
    const secondSession: ChatSession = {
      ...restoredSession(),
      id: 2,
      sessionId: "SESSION-WITHOUT-ATTACHMENTS",
      title: "Session without attachments",
    };
    const firstSessionMessages = [{
      actor: "User",
      attachments: [{
        contentType: "image/png",
        id: "ATTACHMENT-FROM-FIRST-SESSION",
        kind: "image" as const,
        metadata: {},
        summary: "first-session-image.png",
      }],
      channel: "MAIN_AGENT" as const,
      content: "A message with an attachment",
      createdAt: "2026-06-10T00:00:00.000Z",
      id: 1,
      messageId: "MESSAGE-WITH-ATTACHMENT",
      role: "USER" as const,
      sessionId: firstSession.sessionId,
    }];
    const loadMessages = vi.fn((sessionId: string) => (
      sessionId === firstSession.sessionId
        ? Promise.resolve(firstSessionMessages)
        : new Promise<typeof firstSessionMessages>(() => undefined)
    ));
    const downloadAttachment = vi.fn(() => new Promise<Blob>(() => undefined));
    const adapter: ChatAdapter = {
      ...createAdapter().adapter,
      downloadAttachment,
      loadMessages,
    };
    const { rerender } = render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={firstSession}
      />,
    );

    await waitFor(() => expect(downloadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: firstSession.sessionId }),
      firstSessionMessages[0].attachments[0],
    ));

    rerender(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={secondSession}
      />,
    );

    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith(secondSession.sessionId));
    expect(downloadAttachment).toHaveBeenCalledTimes(1);
  });

  it("detaches a switched session immediately without letting its stale finally clear the new observer", async () => {
    const firstSession = restoredSession();
    const secondSession: ChatSession = {
      ...restoredSession(),
      id: 2,
      sessionId: "SESSION-SECOND",
      title: "Second session",
    };
    let firstReject: ((reason?: unknown) => void) | undefined;
    let secondResolve: ((result: ChatSendResult) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    const streamMessage = vi.fn((
      activeSession: ChatSession,
      _input: SendChatMessageInput,
      _handlers: ChatStreamHandlers,
      signal?: AbortSignal,
    ) => {
      if (activeSession.sessionId === firstSession.sessionId) {
        firstSignal = signal;
        return new Promise<ChatSendResult>((_resolve, reject) => {
          firstReject = reject;
        });
      }
      return new Promise<ChatSendResult>((resolve) => {
        secondResolve = resolve;
      });
    });
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      streamMessage,
    };
    const { rerender } = render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={firstSession}
      />,
    );

    await screen.findByRole("button", { name: "Send" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "first run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));

    rerender(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={secondSession}
      />,
    );
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes("SESSION-SECOND")),
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "second run" },
    });
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstReject?.(new DOMException("Aborted", "AbortError"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    await act(async () => {
      secondResolve?.(completedResult("RUN-SECOND", secondSession));
      await Promise.resolve();
    });
    await screen.findByRole("button", { name: "Send" });
  });

  it("restores an authoritative run so steer and Stop work after remount", async () => {
    let activeRun: ChatActiveRun | null = {
      runId: "RUN-REMOTE",
      runtimeAdapterKey: "react",
      state: "RUNNING" as const,
      supportsSteer: true,
    };
    const getActiveRun = vi.fn(async () => ({
      activeRun,
      sessionId: "SESSION-RESTORED",
    }));
    const steerMessage = vi.fn().mockResolvedValue({
      message: {
        actor: "User",
        channel: "MAIN_AGENT",
        content: "Redirect the remote run",
        createdAt: "2026-07-16T00:00:01Z",
        id: "22",
        messageId: "MSG-REMOTE-STEER",
        role: "USER",
        runId: "RUN-REMOTE",
        sessionId: "SESSION-RESTORED",
      },
      runId: "RUN-REMOTE",
      sessionId: "SESSION-RESTORED",
    });
    const stopRun = vi.fn(async () => {
      activeRun = null;
      return {
        runId: "RUN-REMOTE",
        sessionId: "SESSION-RESTORED",
      };
    });
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsSteer: true,
        supportsStop: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun,
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      steerMessage,
      stopRun,
      streamMessage: vi.fn(),
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await screen.findByRole("button", { name: "Stop" });
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Redirect the remote run" },
    });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(steerMessage).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
        expect.objectContaining({ content: "Redirect the remote run" }),
        { expectedRunId: "RUN-REMOTE" },
        expect.any(AbortSignal),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(stopRun).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
        { expectedRunId: "RUN-REMOTE" },
      );
    });
    expect(adapter.streamMessage).not.toHaveBeenCalled();
  });

  it("keeps a finishing remote run queue-only and drains one FIFO item on natural completion", async () => {
    let activeRun: {
      runId: string;
      runtimeAdapterKey: string;
      state: "FINISHING";
      supportsSteer: boolean;
    } | null = {
      runId: "RUN-FINISHING",
      runtimeAdapterKey: "react",
      state: "FINISHING",
      supportsSteer: true,
    };
    const streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-NEXT"));
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsSteer: true,
        supportsStop: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun: vi.fn(async () => ({
        activeRun,
        sessionId: "SESSION-RESTORED",
      })),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      steerMessage: vi.fn(),
      stopRun: vi.fn(),
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => expect(adapter.getActiveRun).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Run after the remote turn" },
    });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(streamMessage).not.toHaveBeenCalled();

    activeRun = null;
    await waitFor(() => {
      expect(streamMessage).toHaveBeenCalledTimes(1);
    }, { timeout: 2500 });
    expect(streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
      expect.objectContaining({ content: "Run after the remote turn" }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it("keeps the last active snapshot on status errors and waits for protocol terminal before draining", async () => {
    let statusMode: "active" | "error" | "idle" = "active";
    let terminal = false;
    let idleQueries = 0;
    const getActiveRun = vi.fn(async () => {
      if (statusMode === "error") throw new Error("status unavailable");
      if (statusMode === "idle") idleQueries += 1;
      return {
        activeRun: statusMode === "active"
          ? {
              runId: "RUN-REMOTE",
              runtimeAdapterKey: "react",
              state: "RUNNING" as const,
              supportsSteer: false,
            }
          : null,
        sessionId: "SESSION-RESTORED",
      };
    });
    const loadProtocolEvents = vi.fn(async () => [
      {
        runId: "RUN-REMOTE",
        threadId: "SESSION-RESTORED",
        type: "RUN_STARTED",
      },
      ...(terminal
        ? [{
            runId: "RUN-REMOTE",
            threadId: "SESSION-RESTORED",
            type: "RUN_FINISHED",
          }]
        : []),
    ]);
    const streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-NEXT"));
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: true,
        supportsProtocolReplay: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun,
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      loadProtocolEvents,
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );
    await waitFor(() => expect(getActiveRun).toHaveBeenCalled());
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Wait for a real terminal" },
    });
    fireEvent.keyDown(composer, { key: "Enter" });

    statusMode = "error";
    await waitFor(() => expect(getActiveRun.mock.calls.length).toBeGreaterThan(1), {
      timeout: 2500,
    });
    expect(streamMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    statusMode = "idle";
    await waitFor(() => expect(idleQueries).toBeGreaterThan(0), {
      timeout: 2500,
    });
    expect(streamMessage).not.toHaveBeenCalled();

    terminal = true;
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1), {
      timeout: 2500,
    });
  }, 8000);

  it("does not drain queued work when a recovered run is explicitly stopped", async () => {
    let activeRun: ChatActiveRun | null = {
      runId: "RUN-REMOTE",
      runtimeAdapterKey: "react",
      state: "RUNNING",
      supportsSteer: false,
    };
    const streamMessage = vi.fn();
    const stopRun = vi.fn(async () => {
      activeRun = null;
      return {
        runId: "RUN-REMOTE",
        sessionId: "SESSION-RESTORED",
      };
    });
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsStop: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun: vi.fn(async () => ({
        activeRun,
        sessionId: "SESSION-RESTORED",
      })),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      stopRun,
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await screen.findByRole("button", { name: "Stop" });
    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Keep queued after Stop" },
    });
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(stopRun).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Send" });
    expect(screen.getByText("Keep queued after Stop")).toBeTruthy();
    expect(streamMessage).not.toHaveBeenCalled();
  });

  it("stops polling after active-run confirms idle despite a recent user message and open replay", async () => {
    const getActiveRun = vi.fn().mockResolvedValue({
      activeRun: null,
      sessionId: "SESSION-RESTORED",
    });
    const loadMessages = vi.fn().mockResolvedValue([
      {
        actor: "User",
        channel: "MAIN_AGENT",
        content: "A completed request",
        createdAt: new Date().toISOString(),
        id: 1,
        messageId: "MESSAGE-1",
        role: "USER",
        runId: "RUN-STALE",
        sessionId: "SESSION-RESTORED",
      },
    ]);
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: true,
        supportsProtocolReplay: true,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun,
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages,
      loadProtocolEvents: vi.fn().mockResolvedValue([
        {
          runId: "RUN-STALE",
          threadId: "SESSION-RESTORED",
          type: "RUN_STARTED",
        },
      ]),
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => expect(getActiveRun).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    expect(getActiveRun).toHaveBeenCalledTimes(1);
    expect(loadMessages).toHaveBeenCalledTimes(1);
  });

  it("turns a send race into one queued message without retaining optimistic duplicates", async () => {
    let activeRun: ChatActiveRun | null = null;
    let failedStatusRefreshes = 0;
    const streamMessage = vi.fn(async () => {
      activeRun = {
        runId: "RUN-OTHER",
        runtimeAdapterKey: "react",
        state: "RUNNING",
        supportsSteer: false,
      };
      failedStatusRefreshes = 2;
      throw new ChatAdapterError(
        "session already has an active agent run",
        {
          code: "RUN_ALREADY_ACTIVE",
          data: { activeRunCode: "RUN-OTHER" },
          status: 409,
        },
      );
    });
    const onInfo = vi.fn();
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsActiveRun: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      getActiveRun: vi.fn(async () => {
        if (failedStatusRefreshes > 0) {
          failedStatusRefreshes -= 1;
          throw new Error("active status temporarily unavailable");
        }
        return {
          activeRun,
          sessionId: "SESSION-RESTORED",
        };
      }),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
        onInfo={onInfo}
      />,
    );
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Queue after the race" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onInfo).toHaveBeenCalledWith(
        "Another response is already running; your message was queued.",
        "Message queued",
      );
    });
    const queue = screen.getByRole("region", { name: "Queued" });
    expect(within(queue).getAllByText("Queue after the race")).toHaveLength(1);
    expect(screen.getAllByText("Queue after the race")).toHaveLength(1);
    expect(streamMessage).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(adapter.getActiveRun).toHaveBeenCalledTimes(4);
    }, { timeout: 2500 });
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it.each(["off", "typewriter"] as const)("shows each AG-UI model step immediately in a stable card with %s text", async (effect) => {
    const { adapter, loadMessages } = createAdapter();
    let handlers: ChatStreamHandlers | undefined;
    let finish: (result: ChatSendResult) => void = () => undefined;
    adapter.streamMessage = vi.fn((_session, _input, next) => new Promise(resolve => { handlers = next; finish = resolve; }));
    render(<ChatRuntimeWindow adapter={adapter} agentReplyEffect={effect} config={{ floating: false }} initialSession={restoredSession()} />);
    await waitFor(() => expect(loadMessages).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Inspect the repository" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(handlers).toBeDefined());
    let sequence = 0;
    const emit = (type: string, messageId: string, delta?: string) => act(() => {
      handlers!.onAguiEvent?.({ type, messageId, delta, runId: "RUN-STREAM", threadId: "SESSION-RESTORED", metadata: { framework: { runId: "NATIVE-RUN" }, tron: { eventId: `frame:${++sequence}` } } });
      if (delta) handlers!.onDelta?.(delta);
    });
    emit("TEXT_MESSAGE_START", "step-first");
    emit("TEXT_MESSAGE_CONTENT", "step-first", "First progress summary");
    await waitFor(() => expect(document.querySelector('[data-message-id="step-first"]')?.textContent).toContain("First"));
    const first = document.querySelector('[data-message-id="step-first"]');
    emit("TEXT_MESSAGE_END", "step-first");
    expect(first?.textContent).toContain("First progress summary");
    expect(first?.getAttribute("data-streaming")).toBeNull();
    emit("TEXT_MESSAGE_START", "step-second");
    emit("TEXT_MESSAGE_CONTENT", "step-second", "Second progress summary");
    await waitFor(() => expect(document.querySelector('[data-message-id="step-second"]')?.textContent).toContain("Second"));
    expect(document.querySelector('[data-message-id="step-first"]')).toBe(first);
    expect(first?.textContent).not.toContain("Second");
    emit("TEXT_MESSAGE_END", "step-second");
    emit("TEXT_MESSAGE_START", "step-final");
    emit("TEXT_MESSAGE_CONTENT", "step-final", "Final answer");
    emit("TEXT_MESSAGE_END", "step-final");
    expect(screen.getAllByText("First progress summary")).toHaveLength(1);
    expect(screen.getAllByText("Second progress summary")).toHaveLength(1);
    expect(screen.getAllByText("Final answer")).toHaveLength(1);
    // A slow presentation refresh must retain the same protocol message IDs.
    loadMessages.mockImplementation(() => new Promise(() => {}));
    const result = completedResult("RUN-STREAM");
    result.messages = [{ id: "product-final", messageId: "product-final", role: "ASSISTANT", sessionId: "SESSION-RESTORED", runId: "RUN-STREAM", channel: "MAIN_AGENT", content: "Final answer\n\n", createdAt: new Date().toISOString() }];
    await act(async () => finish(result));
    expect(document.querySelector('[data-message-id="step-first"]')?.textContent).toContain("First progress summary");
    expect(screen.getAllByText("Final answer")).toHaveLength(1);
    expect(document.querySelectorAll('[data-theme-part="chat-message-assistant"]')).toHaveLength(3);
  });

  it("steers the active run and drains queued messages in FIFO order", async () => {
    const pendingStreams: Array<{
      handlers?: ChatStreamHandlers;
      input: SendChatMessageInput;
      resolve: (result: ChatSendResult) => void;
    }> = [];
    const streamMessage = vi.fn((
      _session: ChatSession,
      input: SendChatMessageInput,
      handlers?: ChatStreamHandlers,
    ) => new Promise<ChatSendResult>((resolve) => {
      pendingStreams.push({ handlers, input, resolve });
    }));
    const steerMessage = vi.fn().mockResolvedValue({
      message: {
        actor: "User",
        channel: "MAIN_AGENT",
        content: "Change direction",
        createdAt: "2026-07-16T00:00:01Z",
        id: 22,
        messageId: "MSG-STEER-1",
        role: "USER",
        runId: "RUN-1",
        sessionId: "SESSION-RESTORED",
      },
      runId: "RUN-1",
      sessionId: "SESSION-RESTORED",
    });
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
      loadMessages: vi.fn().mockResolvedValue([]),
      steerMessage,
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false, inputSuggestions: [{ kind: "skill", name: "review" }] }}
        initialSession={restoredSession()}
      />,
    );

    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "$review Start the run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(pendingStreams).toHaveLength(1));

    expect(pendingStreams[0].input.requestedSkills).toEqual(["review"]);
    act(() => {
      pendingStreams[0].handlers?.onAguiEvent?.({
        runId: "RUN-1",
        type: "RUN_STARTED",
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();

    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "$review Change direction" },
    });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    await waitFor(() => {
      expect(steerMessage).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "SESSION-RESTORED" }),
        expect.objectContaining({ content: "$review Change direction", requestedSkills: ["review"] }),
        { expectedRunId: "RUN-1" },
        expect.any(AbortSignal),
      );
    });
    expect(screen.getAllByText("Change direction").length).toBeGreaterThan(0);

    fireEvent.change(composer, {
      target: { value: "$review Run this next" },
    });
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(document.querySelector(".ef-chat__queued-message-content")?.textContent).toBe("$review Run this next"));

    await act(async () => {
      pendingStreams[0].resolve(completedResult("RUN-1"));
    });
    await waitFor(() => expect(pendingStreams).toHaveLength(2));
    expect(pendingStreams[1].input.requestedSkills).toEqual(["review"]);
    expect(pendingStreams[1].input.content).toBe("$review Run this next");

    await act(async () => {
      pendingStreams[1].resolve(completedResult("RUN-2"));
    });
  });

  it("restores saved explicit skill identities when editing history without current suggestions", async () => {
    const { adapter, loadMessages } = createAdapter();
    loadMessages.mockResolvedValue([{ id: 1, messageId: "saved-selection", sessionId: "SESSION-RESTORED", role: "USER", channel: "MAIN_AGENT", content: "$review saved", requestedSkills: ["review"], createdAt: "2026-06-10T00:00:00.000Z" }]);
    adapter.streamMessage = vi.fn().mockResolvedValue(completedResult("RUN-EDIT"));
    render(<ChatRuntimeWindow adapter={adapter} config={{ floating: false, inputSuggestions: [] }} initialSession={restoredSession()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit message" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(adapter.streamMessage).toHaveBeenCalled());
    expect(vi.mocked(adapter.streamMessage!).mock.calls[0][1]).toMatchObject({ content: "$review saved", requestedSkills: ["review"] });
  });

  it("preserves explicitly rejected queued work for editing without retrying it", async () => {
    let finish: (result: ChatSendResult) => void = () => undefined;
    const streamMessage = vi.fn().mockImplementationOnce(() => new Promise<ChatSendResult>(resolve => { finish = resolve; }))
      .mockRejectedValue(new ChatAdapterError("Skill access revoked", { code: "101032002", rejectedBeforeAdmission: true }));
    const adapter: ChatAdapter = {
      capabilities: { supportsStreaming: true, supportsAgui: true }, createSession: vi.fn(),
      loadMessages: vi.fn().mockResolvedValue([]), loadAguiEvents: vi.fn().mockResolvedValue([]), streamMessage,
    };
    const config = { floating: false, inputSuggestions: [{ kind: "skill" as const, name: "review" }] };
    const view = render(<ChatRuntimeWindow adapter={adapter} config={config} initialSession={restoredSession()} />);
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));
    fireEvent.change(editor, { target: { value: "$review next" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit queued message" })).toBeTruthy());
    view.rerender(<ChatRuntimeWindow adapter={adapter} config={{ floating: false, inputSuggestions: [] }} initialSession={restoredSession()} />);
    await act(async () => finish(completedResult("RUN-FIRST")));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit queued message" })).toBeTruthy());
    expect(streamMessage.mock.calls[1][1].requestedSkills).toEqual(["review"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit queued message" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("$review next");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(3));
    expect(streamMessage.mock.calls[2][1].requestedSkills).toEqual(["review"]);
  });

  it("consumes an interrupted active item and pauses the remaining FIFO", async () => {
    const pendingStreams: Array<{
      input: SendChatMessageInput;
      resolve: (result: ChatSendResult) => void;
    }> = [];
    const streamMessage = vi.fn((
      _session: ChatSession,
      input: SendChatMessageInput,
      _handlers?: ChatStreamHandlers,
      signal?: AbortSignal,
    ) => new Promise<ChatSendResult>((resolve) => {
      signal?.addEventListener(
        "abort",
        () => resolve(completedResult("RUN-STOPPED")),
        { once: true },
      );
      pendingStreams.push({ input, resolve });
    }));
    const adapter: ChatAdapter = {
      capabilities: {
        supportsAbort: true,
        supportsAgui: false,
        supportsProtocolReplay: false,
        supportsStreaming: true,
      },
      createSession: vi.fn(),
      loadAguiEvents: vi.fn().mockResolvedValue([]),
      loadMessages: vi.fn().mockResolvedValue([]),
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
      />,
    );
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "First" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(pendingStreams).toHaveLength(1));

    for (const content of ["Second", "Third"]) {
      const composer = screen.getByRole("textbox");
      fireEvent.change(composer, {
        target: { value: content },
      });
      fireEvent.keyDown(composer, { key: "Enter" });
    }

    await act(async () => {
      pendingStreams[0].resolve(completedResult("RUN-1"));
    });
    await waitFor(() => expect(pendingStreams).toHaveLength(2));
    expect(pendingStreams[1].input.content).toBe("Second");

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      const queue = screen.getByRole("region", { name: "Queued" });
      expect(
        within(queue)
          .getAllByRole("listitem")
          .map((item) => item.textContent?.replace(/\s+/g, "").trim()),
      ).toEqual(["Third"]);
    });
    expect(pendingStreams).toHaveLength(2);
  });

  it("starts a failed steer fallback when the active run already finished", async () => {
    const pendingStreams: Array<{
      handlers?: ChatStreamHandlers;
      input: SendChatMessageInput;
      resolve: (result: ChatSendResult) => void;
    }> = [];
    const streamMessage = vi.fn((
      _session: ChatSession,
      input: SendChatMessageInput,
      handlers?: ChatStreamHandlers,
    ) => new Promise<ChatSendResult>((resolve) => {
      pendingStreams.push({ handlers, input, resolve });
    }));
    let rejectSteer: (error: Error) => void = () => undefined;
    const steerMessage = vi.fn(() => new Promise<never>((_resolve, reject) => {
      rejectSteer = reject;
    }));
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
      loadMessages: vi.fn().mockResolvedValue([]),
      steerMessage,
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
        onError={vi.fn()}
      />,
    );
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "First" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(pendingStreams).toHaveLength(1));
    act(() => {
      pendingStreams[0].handlers?.onAguiEvent?.({
        runId: "RUN-1",
        type: "RUN_STARTED",
      });
    });

    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Late steer" },
    });
    await screen.findByRole("button", { name: "Stop" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    await waitFor(() => expect(steerMessage).toHaveBeenCalledTimes(1));
    await act(async () => {
      pendingStreams[0].resolve(completedResult("RUN-1"));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    });

    await act(async () => {
      rejectSteer(new ChatAdapterError("run already finished", {
        code: "STEER_RUN_FINISHING",
        status: 409,
      }));
    });
    await waitFor(() => expect(pendingStreams).toHaveLength(2));
    expect(pendingStreams[1].input.content).toBe("Late steer");
  });

  it("does not requeue a steer ACK that resolves after Stop detaches it", async () => {
    let streamHandlers: ChatStreamHandlers | undefined;
    const steerAckDelivered = vi.fn();
    const streamMessage = vi.fn((
      _session: ChatSession,
      _input: SendChatMessageInput,
      handlers?: ChatStreamHandlers,
      signal?: AbortSignal,
    ) => new Promise<ChatSendResult>((_resolve, reject) => {
      streamHandlers = handlers;
      signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    }));
    const steerMessage = vi.fn((
      _session: ChatSession,
      input: SendChatMessageInput,
      _context: { expectedRunId: string },
      signal?: AbortSignal,
    ) => new Promise((resolve) => {
      signal?.addEventListener(
        "abort",
        () => {
          steerAckDelivered();
          resolve({
            message: {
              actor: "User",
              channel: "MAIN_AGENT",
              content: input.content,
              createdAt: "2026-07-16T00:00:01Z",
              id: 23,
              messageId: "MSG-LATE-STEER",
              role: "USER",
              runId: "RUN-1",
              sessionId: "SESSION-RESTORED",
            },
            runId: "RUN-1",
            sessionId: "SESSION-RESTORED",
          });
        },
        { once: true },
      );
    }));
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
      loadMessages: vi.fn().mockResolvedValue([]),
      steerMessage,
      streamMessage,
    };

    render(
      <ChatRuntimeWindow
        adapter={adapter}
        config={{ floating: false }}
        initialSession={restoredSession()}
        onInfo={vi.fn()}
      />,
    );
    await waitFor(() => expect(adapter.loadMessages).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "First" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));
    act(() => {
      streamHandlers?.onAguiEvent?.({
        runId: "RUN-1",
        supportsSteer: true,
        type: "RUN_STARTED",
      });
    });

    const composer = screen.getByRole("textbox");
    fireEvent.change(composer, {
      target: { value: "Keep this steer" },
    });
    await screen.findByRole("button", { name: "Stop" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    await waitFor(() => expect(steerMessage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(steerAckDelivered).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Queued" })).toBeNull();
    expect(screen.queryByText("Keep this steer")).toBeNull();
    expect(streamMessage).toHaveBeenCalledTimes(1);
  });
});


it("unmount detaches the transport without stopping a host-owned run", async () => {
  const { adapter } = createAdapter();
  const stopRun = vi.fn();
  adapter.stopRun = stopRun;
  let signal: AbortSignal | undefined;
  adapter.streamMessage = vi.fn((_session, _input, _handlers, transportSignal) => {
    signal = transportSignal;
    return new Promise<ChatSendResult>(() => undefined);
  });
  const view = render(<ChatRuntimeWindow adapter={adapter} initialSession={restoredSession()} config={{floating:false}} onError={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Start background work"}});
  fireEvent.click(screen.getByRole("button", {name:"Send"}));
  await waitFor(() => expect(adapter.streamMessage).toHaveBeenCalledOnce());
  view.unmount();
  expect(signal?.aborted).toBe(true);
  expect(stopRun).not.toHaveBeenCalled();
});
