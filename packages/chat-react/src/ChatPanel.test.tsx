// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  ChatAguiStreamEvent,
  ChatMessage,
  ChatQueuedSubmission,
  ChatSession,
  ChatUserInputRequest,
} from "@eliteforge/agent-ui-chat-core";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
});

function activeSession(): ChatSession {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    id: 1,
    sessionId: "SESSION-1",
    status: "ACTIVE",
    title: "Panel test",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function renderPanel(
  props: Partial<ComponentProps<typeof ChatPanel>> = {},
) {
  return render(
    <ChatPanel
      draft="Follow up"
      messages={[]}
      onDraftChange={() => undefined}
      onSend={() => undefined}
      session={activeSession()}
      showHeader={false}
      {...props}
    />,
  );
}

function queuedSubmission(
  id: string,
  content: string,
): ChatQueuedSubmission {
  return {
    id,
    input: {
      content,
    },
    sessionId: "SESSION-1",
  };
}

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    actor: role === "USER" ? "Operator" : "Assistant",
    channel: "MAIN_AGENT",
    content,
    createdAt: "2026-07-16T10:59:00.000Z",
    id: `${role}-${content}`,
    messageId: `${role}-${content}`,
    role,
    sessionId: "SESSION-1",
  };
}

describe("ChatPanel theme hooks", () => {
  it("exposes stable theme parts for the chat, messages, input, and effect layer", () => {
    renderPanel({
      messages: [message("USER", "Hello"), message("ASSISTANT", "Hi")],
    });

    expect(document.querySelector('[data-theme-part="chat"]')).toBeTruthy();
    expect(
      document.querySelector('[data-theme-effect-layer="chat"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-theme-part="chat-message-user"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-theme-part="chat-message-assistant"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-theme-part="chat-input"]'),
    ).toBeTruthy();
  });
});

describe("ChatPanel submit controls", () => {
  it("shows exact cancellation neutrally in live output and durable replay", () => {
    const user = message("USER", "Stop this response");
    const startedAt = Date.parse(user.createdAt) + 1;
    const events: ChatAguiStreamEvent[] = [
      { type: "RUN_STARTED", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt },
      { type: "RUN_ERROR", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 1,
        code: "AGENT_CANCELLED", message: "Agent run cancelled" },
    ];
    const props = { draft: "", onDraftChange: () => undefined, onSend: () => undefined, session: activeSession(), messages: [user] };
    const { rerender } = render(<ChatPanel {...props} liveAguiEvents={events} />);
    expect(screen.getByText(/^Run stopped ·/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Run stopped");
    expect(screen.getByRole("status").className).not.toContain("ef-chat__run-notice--error");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/^Working for/)).toBeNull();
    rerender(<ChatPanel {...props} protocolEvents={events} />);
    expect(screen.getByText(/^Run stopped ·/)).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a custom stopped label for both the neutral notice and rail", () => {
    const user = message("USER", "Stop this response");
    renderPanel({
      messages: [user],
      workRailLabels: {
        ariaLabel: "智能体工作过程", preparing: "准备中", responding: "回复中", thinking: "思考中",
        workedFor: (duration) => `已工作 ${duration}`, workingFor: (duration) => `正在工作 ${duration}`,
        stopped: "已停止",
      },
      protocolEvents: [{
        type: "RUN_ERROR", runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1,
        code: "AGENT_CANCELLED", message: "Agent run cancelled",
      }],
    });
    expect(screen.getByText(/^已停止 ·/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("已停止");
    expect(screen.getByRole("status").className).not.toContain("ef-chat__run-notice--error");
    expect(screen.queryByText(/^Run stopped/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["AGENT_MODEL_FAILED", "AGENT_RUN_FAILED", "AGENT_RUN_STOPPED"])(
    "keeps code %s red even with cancellation wording",
    (code) => {
      const user = message("USER", "Try a model response");
      renderPanel({ messages: [user], protocolEvents: [{
        type: "RUN_ERROR", runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1,
        code, message: "Agent run cancelled",
      }] });
      expect(screen.getByText(/^Run failed ·/)).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("Agent run cancelled");
      expect(screen.getByRole("alert").className).toContain("ef-chat__run-notice--error");
      expect(screen.queryByText(/^Run stopped/)).toBeNull();
    },
  );

  it.each(["RUN-1", "CHILD-1"])("retains a real failure in %s when the parent is subsequently cancelled", (failedRunId) => {
    const user = message("USER", "Run collaborating agents");
    const base = { threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1 };
    renderPanel({ messages: [user], protocolEvents: [
      { ...base, type: "RUN_ERROR", runId: failedRunId, code: "AGENT_RUN_FAILED", message: "Model stream failed" },
      { ...base, timestamp: base.timestamp + 1, type: "RUN_ERROR", runId: "RUN-1", code: "AGENT_CANCELLED", message: "Agent run cancelled" },
    ] });
    expect(screen.getByText(/^Run failed ·/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Model stream failed");
    if (failedRunId === "CHILD-1") {
      // Separate run rails preserve the child error and the parent's neutral stop.
      expect(screen.getByText(/^Run stopped ·/)).toBeTruthy();
      expect(screen.getByRole("status").textContent).toContain("Agent run cancelled");
    } else {
      expect(screen.queryAllByText(/^Run stopped/)).toHaveLength(0);
    }
  });

  it("keeps actual presentation loss red after a cancellation", () => {
    const user = message("USER", "Stop with incomplete output");
    const base = { runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1 };
    renderPanel({ messages: [user], protocolEvents: [
      { ...base, type: "RUN_ERROR", code: "AGUI_OUTPUT_OVERFLOW", message: "Output lost" },
      { ...base, timestamp: base.timestamp + 1, type: "RUN_ERROR", code: "AGENT_CANCELLED", message: "Agent run cancelled" },
    ] });
    expect(screen.getByText(/^Run stopped ·/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Run stopped");
    expect(screen.getByRole("alert").textContent).toContain("Presentation replay is incomplete");
    expect(screen.getByRole("alert").className).toContain("ef-chat__run-notice--error");
  });

  it("shows budget failures without expanding the rail or adding an assistant message", () => {
    const user = message("USER", "Inspect tools");
    renderPanel({
      messages: [user],
      protocolEvents: [{
        type: "RUN_ERROR", runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1,
        code: "tool_schema_over_budget",
        message: "TOOL_SCHEMA_OVER_BUDGET: estimatedTokens=27294, limitTokens=21597, toolCount=89; tool exposure was not changed",
      }],
    });
    expect(screen.getByText(/^Run failed ·/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Run failed/ })).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Tool definitions exceed the context budget");
    expect(alert.textContent).toContain("27,294");
    expect(alert.textContent).toContain("21,597");
    expect(alert.textContent).toContain("89 tools");
    expect(screen.queryByText(/TOOL_SCHEMA_OVER_BUDGET:/)).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("updates a single visible compaction status and keeps its result when the rail collapses", () => {
    const user = message("USER", "Compact context");
    const startedAt = Date.parse(user.createdAt) + 1;
    const events: ChatAguiStreamEvent[] = [
      { type: "RUN_STARTED", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt },
      { type: "CUSTOM", name: "agent.memory.compaction.started", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 1 },
    ];
    const props = { draft: "", onDraftChange: () => undefined, onSend: () => undefined, session: activeSession(), messages: [user] };
    const { rerender } = render(<ChatPanel {...props} liveAguiEvents={events} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Compacting context…");
    expect(screen.queryByText("Thinking…")).toBeNull();
    rerender(<ChatPanel {...props} protocolEvents={[
      ...events,
      { ...events[1], name: "agent.memory.compaction.completed", timestamp: startedAt + 2 },
      { ...events[0], type: "RUN_FINISHED", timestamp: startedAt + 3 },
    ]} liveAguiEvents={events} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Context compacted");
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Worked for/ })).toBeNull();
  });

  it("shows generic errors and compaction failures with custom localized labels", () => {
    const user = message("USER", "Retry");
    const base = { runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1 };
    renderPanel({
      messages: [user],
      workRailLabels: {
        ariaLabel: "智能体工作过程", preparing: "准备中", responding: "回复中", thinking: "思考中",
        workedFor: (duration) => `已工作 ${duration}`, workingFor: (duration) => `正在工作 ${duration}`,
        failed: "运行失败", notices: { compactionFailed: "上下文压缩失败" },
      },
      protocolEvents: [
        { ...base, type: "CUSTOM", name: "agent.memory.compaction.failed", value: { errorCode: "COMPACTION_MODEL_FAILED" } },
        { ...base, type: "RUN_ERROR", code: "model_unavailable", message: "Model is unavailable" },
      ],
    });
    expect(screen.getByText("上下文压缩失败")).toBeTruthy();
    expect(screen.getByText("COMPACTION_MODEL_FAILED")).toBeTruthy();
    expect(screen.getByText("Model is unavailable")).toBeTruthy();
    expect(screen.getByText(/^运行失败 ·/)).toBeTruthy();
  });

  it("shows a stable activity stage while running and auto-collapses when complete", () => {
    const startedAt = Date.now() - 2_000;
    const messages = [{
      actor: "User",
      channel: "MAIN_AGENT",
      content: "Inspect the implementation",
      createdAt: new Date(startedAt).toISOString(),
      id: 1,
      messageId: "MSG-USER",
      role: "USER" as const,
      sessionId: "SESSION-1",
    }];
    const activeEvents: ChatAguiStreamEvent[] = [
      { runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt, type: "RUN_STARTED" },
      { activity: "THINKING", runId: "RUN-1", summary: "Inspecting the implementation plan.", threadId: "SESSION-1", timestamp: startedAt + 1, type: "ACTIVITY_SNAPSHOT" },
      { messageId: "reasoning-1", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 2, type: "REASONING_MESSAGE_START" },
      { delta: "Inspecting the implementation.", messageId: "reasoning-1", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 3, type: "REASONING_MESSAGE_CONTENT" },
    ];
    const panelProps = {
      draft: "Follow up",
      messages,
      onDraftChange: () => undefined,
      onSend: () => undefined,
      session: activeSession(),
      showHeader: false,
    };
    const { rerender } = render(<ChatPanel {...panelProps} protocolEvents={activeEvents} />);

    const summaryButton = screen.getByRole("button", { name: /Working for/ });
    expect(screen.getByText("Inspecting the implementation.")).toBeTruthy();
    fireEvent.click(summaryButton);
    expect(summaryButton.getAttribute("aria-expanded")).toBe("true");

    rerender(
      <ChatPanel
        {...panelProps}
        protocolEvents={[
          ...activeEvents,
          { runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 3_000, type: "RUN_FINISHED" },
        ]}
      />,
    );

    const completedButton = screen.getByRole("button", { name: /Worked for/ });
    expect(completedButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Inspecting the implementation.")).toBeNull();
    fireEvent.click(completedButton);
    expect(completedButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("collapses answered user questions into completed work in event order", () => {
    const messages = [
      message("USER", "Choose a direction"),
      {
        ...message("ASSISTANT", "Please choose one."),
        messageId: "MSG-ASK",
        runId: "RUN-1",
      },
    ];
    const request: ChatUserInputRequest = {
      assistantMessageId: "MSG-ASK",
      answers: [{
        answerKind: "Option",
        optionId: "OPTION-1",
        questionId: "QUESTION-1",
      }],
      intro: "Choose a direction",
      questions: [{
        options: [{
          description: "Continue with the first option.",
          label: "First option",
          optionId: "OPTION-1",
        }],
        question: "Which direction?",
        questionId: "QUESTION-1",
      }],
      requestId: "INPUT-1",
      requestedAt: 1_002,
      runId: "RUN-1",
      sessionId: "SESSION-1",
      status: "Answered",
    };

    renderPanel({
      messages,
      protocolEvents: [
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_000, type: "RUN_STARTED" },
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_001, type: "REASONING_START" },
        { delta: "Before question", runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_002, type: "REASONING_MESSAGE_CONTENT" },
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_003, type: "REASONING_END" },
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_005, type: "REASONING_START" },
        { delta: "After question", runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_006, type: "REASONING_MESSAGE_CONTENT" },
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_007, type: "REASONING_END" },
        { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1_008, type: "RUN_FINISHED" },
      ],
      userInputRequests: [request],
    });

    const workSummary = screen.getByRole("button", { name: /Worked for/ });
    expect(workSummary.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Asked 1 questions" })).toBeNull();
    fireEvent.click(workSummary);

    const workItems = screen.getByLabelText("Agent work rail");
    const summary = within(workItems).getByRole("button", { name: "Asked 1 questions" });
    expect(screen.queryByText("Which direction?")).toBeNull();
    const itemButtons = within(workItems).getAllByRole("button");
    expect(itemButtons.map((button) => button.textContent).join(" ")).toMatch(
      /Before question[\s\S]*Asked 1 questions[\s\S]*After question/,
    );
    fireEvent.click(summary);
    expect(screen.getByText("Which direction?")).toBeTruthy();
    expect(screen.getByText("First option")).toBeTruthy();
  });

  it("hides the active empty assistant card while retaining historical empty responses", () => {
    const userMessage = {
      actor: "User",
      channel: "MAIN_AGENT",
      content: "Create the document",
      createdAt: "2026-07-16T00:00:00.000Z",
      id: 1,
      messageId: "MSG-USER",
      role: "USER" as const,
      sessionId: "SESSION-1",
    };
    const emptyAssistant = {
      actor: "Assistant",
      channel: "MAIN_AGENT",
      content: "",
      createdAt: "2026-07-16T00:00:00.000Z",
      id: 2,
      messageId: "MSG-ASSISTANT",
      role: "ASSISTANT" as const,
      sessionId: "SESSION-1",
    };
    const messages = [userMessage, emptyAssistant];
    const { rerender } = renderPanel({ messages });

    expect(screen.getByText("No assistant response was produced.")).toBeTruthy();
    expect(screen.queryByText("Waiting for assistant output...")).toBeNull();

    rerender(
      <ChatPanel
        draft="Follow up"
        messages={[
          ...messages,
          {
            ...userMessage,
            content: "Try again",
            id: 3,
            messageId: "MSG-USER-RETRY",
          },
        ]}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        sending
        session={activeSession()}
        showHeader={false}
      />,
    );

    expect(screen.getByText("No assistant response was produced.")).toBeTruthy();
    expect(screen.queryByText("Waiting for assistant output...")).toBeNull();

    rerender(
      <ChatPanel
        draft="Follow up"
        messages={messages}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        sending
        session={activeSession()}
        showHeader={false}
      />,
    );

    expect(screen.queryByText("Waiting for assistant output...")).toBeNull();
    expect(document.querySelectorAll('[data-theme-part="chat-message-assistant"]')).toHaveLength(0);
    expect(screen.queryByText("No assistant response was produced.")).toBeNull();
  });

  it("renders message actions below the message content", () => {
    renderPanel({
      messages: [
        message("USER", "User message"),
        message("ASSISTANT", "Assistant message"),
      ],
      onEditMessage: vi.fn(),
    });

    const userMessage = screen.getByText("User message", {
      selector: ".ef-chat__message-body",
    }).closest("article");
    const assistantMessage = screen.getByText("Assistant message", {
      selector: ".markdown-body p",
    }).closest("article");

    expect(userMessage?.querySelector(".ef-chat__message-header .ef-chat__message-actions")).toBeNull();
    expect(assistantMessage?.querySelector(".ef-chat__message-header .ef-chat__message-actions")).toBeNull();
    expect(userMessage?.querySelector(".ef-chat__message-actions")).toBeNull();
    expect(assistantMessage?.querySelector(".ef-chat__message-actions")).toBeNull();
    expect(userMessage?.nextElementSibling?.classList.contains("ef-chat__message-actions--outside")).toBe(true);
    expect(assistantMessage?.nextElementSibling?.classList.contains("ef-chat__message-actions--outside")).toBe(true);
  });

  it("submits the idle draft while preserving Shift+Enter and IME composition", () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    renderPanel({
      draft: "Follow up",
      onDraftChange,
      onSend,
    });

    const composer = screen.getByRole("textbox");
    composer.setSelectionRange(9, 9);

    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(onDraftChange).toHaveBeenCalledWith("Follow up\n");
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { isComposing: true, key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenNthCalledWith(1, "send");
    expect(onSend).toHaveBeenNthCalledWith(2, "send");
    expect(screen.getByRole("button", { name: "Send" }).title).toBe("Send");
  });

  it("uploads an image pasted into the composer instead of inserting it as text", () => {
    const onDraftChange = vi.fn();
    const onPasteAttachment = vi.fn();
    renderPanel({ onDraftChange, onPasteAttachment });

    const file = new File(["image"], "", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        items: [{
          getAsFile: () => file,
          kind: "file",
          type: "image/png",
        }],
      },
    });

    expect(onDraftChange).not.toHaveBeenCalled();
    expect(onPasteAttachment).toHaveBeenCalledTimes(1);
    expect(onPasteAttachment.mock.calls[0][0]).toMatchObject({
      name: expect.stringMatching(/^pasted-image-\d+\.png$/),
      type: "image/png",
    });
  });

  it("opens a preview when a historical image attachment is clicked", () => {
    renderPanel({
      messages: [{
        ...message("USER", "What is this image?"),
        attachments: [{
          contentType: "image/png",
          fileName: "screenshot.png",
          id: "IMAGE-1",
          imageUrl: "data:image/png;base64,AA==",
          kind: "image",
          metadata: {},
          summary: "screenshot.png",
        }],
      }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Preview screenshot.png" }));

    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    expect(within(dialog).getByRole("img", { name: "screenshot.png" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Image preview" })).toBeNull();
  });

  it("shows annotation content while its tag is hovered and supports translated labels", () => {
    renderPanel({
      attachmentLabels: {
        annotationPreview: "注释预览",
        attachments: "附件",
      },
      formatAnnotationCount: (count) => `${count} 条注释`,
      messages: [{
        ...message("USER", "Inspect this element"),
        attachments: [{
          id: "INSPECTION-1",
          imageUrl: "data:image/png;base64,AA==",
          kind: "inspection",
          metadata: {},
          summary: "页面按钮",
        }],
      }],
    });

    const tag = screen.getByRole("button", { name: "注释预览: 1 条注释" });
    expect(screen.queryByRole("tooltip", { name: "注释预览" })).toBeNull();
    fireEvent.mouseEnter(tag);

    const preview = screen.getByRole("tooltip", { name: "注释预览" });
    expect(preview.textContent).toContain("页面按钮");
    expect(within(preview).getByRole("img", { name: "页面按钮" })).toBeTruthy();

    fireEvent.mouseLeave(tag.parentElement!);
    expect(screen.queryByRole("tooltip", { name: "注释预览" })).toBeNull();
  });

  it("keeps a single Stop action and routes Queue and Steer through shortcuts", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderPanel({
      onSend,
      onStop,
      runningSubmitModes: ["queue", "steer"],
      sending: true,
      stopLabel: "Stop response",
    });

    const composer = screen.getByRole("textbox");
    const stopButton = screen.getByRole("button", { name: "Stop response" });

    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();
    expect(composer.getAttribute("placeholder")).toBe(
      "Enter 加入队列 · ⌘/Ctrl+Enter 立即调整当前回复 · Shift+Enter 换行",
    );
    expect(composer.getAttribute("aria-keyshortcuts")).toBe(
      "Meta+Enter Control+Enter",
    );
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    fireEvent.keyDown(composer, { ctrlKey: true, key: "Enter" });
    fireEvent.keyDown(composer, { key: "End", metaKey: true });
    fireEvent.click(stopButton);

    expect(onSend).toHaveBeenNthCalledWith(1, "queue");
    expect(onSend).toHaveBeenNthCalledWith(2, "steer");
    expect(onSend).toHaveBeenNthCalledWith(3, "steer");
    expect(onSend).toHaveBeenCalledTimes(3);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(stopButton.title).toBe("Stop response");
  });

  it("can hide Stop without adding Queue or Steer buttons", () => {
    const onSend = vi.fn();
    renderPanel({
      onSend,
      runningSubmitModes: ["queue", "steer"],
      sending: true,
      showStop: false,
    });

    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();
    const composer = screen.getByRole("textbox");
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });

    expect(onSend).toHaveBeenNthCalledWith(1, "queue");
    expect(onSend).toHaveBeenNthCalledWith(2, "steer");
  });

  it("uses Enter for Queue and respects its disabled state", () => {
    const onSend = vi.fn();
    const { rerender } = renderPanel({
      onSend,
      onStop: vi.fn(),
      runningSubmitModes: ["queue"],
      sending: true,
    });

    const composer = screen.getByRole("textbox");
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    expect(onSend).toHaveBeenCalledWith("queue");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(composer.getAttribute("placeholder")).toBe(
      "Enter 加入队列 · Shift+Enter 换行",
    );
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();

    rerender(
      <ChatPanel
        draft="Follow up"
        messages={[]}
        onDraftChange={() => undefined}
        onSend={onSend}
        onStop={() => undefined}
        queueDisabled
        runningSubmitModes={["queue"]}
        sending
        session={activeSession()}
        showHeader={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("never turns ordinary Enter into Steer when Queue is unavailable", () => {
    const onSend = vi.fn();
    renderPanel({
      onSend,
      runningSubmitModes: ["steer"],
      sending: true,
      showStop: false,
    });

    const composer = screen.getByRole("textbox");
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Steer" })).toBeNull();
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("steer");
  });

  it("requires an explicit Stop click when no running submit mode is available", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderPanel({ onSend, onStop, sending: true });

    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onSend).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("uses the onSend fallback only for an explicit Stop click", () => {
    const onSend = vi.fn();
    renderPanel({ onSend, sending: true });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("send");
  });

  it("renders the controlled queue and delegates edit and remove actions", () => {
    const onEditQueuedMessage = vi.fn();
    const onRemoveQueuedMessage = vi.fn();
    renderPanel({
      onEditQueuedMessage,
      onRemoveQueuedMessage,
      queuedLabel: "Queued replies",
      queuedMessages: [
        queuedSubmission("QUEUE-1", "First follow-up"),
        queuedSubmission("QUEUE-2", "Second follow-up"),
      ],
    });

    const queue = screen.getByRole("region", { name: "Queued replies" });
    expect(within(queue).getByText("2")).toBeTruthy();
    expect(within(queue).getByText("First follow-up")).toBeTruthy();
    expect(within(queue).getByText("Second follow-up")).toBeTruthy();

    fireEvent.click(
      within(queue).getAllByRole("button", { name: "Edit queued message" })[0],
    );
    fireEvent.click(
      within(queue).getAllByRole("button", { name: "Remove queued message" })[1],
    );

    expect(onEditQueuedMessage).toHaveBeenCalledWith(
      "QUEUE-1",
      "First follow-up",
    );
    expect(onRemoveQueuedMessage).toHaveBeenCalledWith("QUEUE-2");
  });
});

it.each([true, false])("collapses provider diagnostics and hides internal step counters after history restore (replay=%s)", (replay) => {
  const raw = 'operation result is unknown: model stream failed before completion: ' + JSON.stringify({type:"response.failed",response:{error:{code:"InvalidParameter",message:"Please check the schema definition for tool: a2ui_expand."}}});
  const message = { id:"assistant", messageId:"assistant", sessionId:"SESSION-1", runId:"RUN-1", role:"ASSISTANT", actor:"Assistant", channel:"history", content:"", createdAt:new Date().toISOString(), history: {
    message:{id:"assistant",runId:"RUN-1",stepId:"step",role:"Assistant",content:[],structured:null,status:"Interrupted",createdAtMs:1},
    step:{id:"step",runId:"RUN-1",nodeInvocationId:null,sequence:1,attempt:1,name:"main",model:null,status:"Interrupted",usage:null,startedAtMs:1,finishedAtMs:2},
    tools:[],interactions:[],run:{id:"RUN-1",sessionId:"SESSION-1",parentRunId:null,rootRunId:"RUN-1",status:"Failed",startedAtMs:1,finishedAtMs:2,error:raw},
  }} satisfies ChatMessage;
  const { container } = renderPanel({ messages:[{...message,id:"user",messageId:"user",role:"USER",content:"请会诊",history:{...message.history,message:{...message.history.message,role:"User"}}},message], protocolEvents:replay ? [{type:"RUN_STARTED",runId:"RUN-1",threadId:"SESSION-1",timestamp:1},{type:"RUN_ERROR",runId:"RUN-1",threadId:"SESSION-1",timestamp:2,message:raw}] : [] });
  expect(screen.queryByText(/Step 1/)).toBeNull();
  expect(screen.queryByText(/Attempt 1/)).toBeNull();
  expect(screen.getByText("The model service rejected the parameter schema for tool a2ui_expand.")).toBeTruthy();
  const diagnostics = screen.getByText(raw);
  expect(diagnostics.closest("details")?.open).toBe(false);
  expect(container.querySelectorAll("details pre")).toHaveLength(1);
});
