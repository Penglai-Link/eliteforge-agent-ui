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
import { historyMessages } from "@eliteforge/agent-ui-chat-core";
import { contiguousToolHistory, contiguousToolEvents } from "../../../contracts/tool-group-contiguous-history";

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

it.each([false, true])("shows search and execution in one collapsed summary across history steps (replay=%s)", replay => {
  const { container } = renderPanel({ messages: historyMessages(contiguousToolHistory), protocolEvents: replay ? contiguousToolEvents : [], showReasoningCards: false });
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  const groups = container.querySelectorAll<HTMLButtonElement>('[aria-label="Tool run steps"] > .ef-chat__rail-entry-toggle');
  expect(groups).toHaveLength(1);
  expect(groups[0].textContent).toBe("Searched 1 time · Performed 1 other action");
  expect(groups[0].getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(0);
  fireEvent.click(groups[0]);
  expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(2);
});

it("renders a child completion notification as system context without user editing", () => {
  renderPanel({
    messages: [{ id: "notice", messageId: "notice", sessionId: "SESSION-1", role: "USER", actor: "User", channel: "history", content: "Child finished", createdAt: "2026-10-15T00:00:00Z", provenance: { sender: { kind: "SYSTEM", displayName: "System notice" }, source: "ChildRunCompletion" } }],
    onEditMessage: vi.fn(),
  });
  expect(screen.getByText("System notice")).toBeTruthy();
  expect(screen.getByText("System notice").closest(".ef-chat__message")?.getAttribute("data-theme-part")).toBe("chat-message-system");
  expect(screen.queryByRole("button", { name: "Edit message" })).toBeNull();
});

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

it.each([40, 200])("keeps the reader's position after scrolling up %s pixels during updates", distance => {
  const props = { draft: "", messages: [message("ASSISTANT", "First reply")], onDraftChange: vi.fn(), onSend: vi.fn(), session: activeSession() };
  const view = render(<ChatPanel {...props} />);
  const transcript = screen.getByRole("region", { name: "Chat transcript" });
  let height = 1200;
  Object.defineProperties(transcript, { clientHeight: { value: 400 }, scrollHeight: { get: () => height }, scrollTop: { value: 800, writable: true } });
  const scroll = vi.fn(({ top }: { top: number }) => { transcript.scrollTop = Math.min(top, height - 400); });
  transcript.scrollTo = scroll;
  fireEvent.scroll(transcript);
  fireEvent.wheel(transcript, { deltaY: -distance });
  transcript.scrollTop -= distance;
  fireEvent.scroll(transcript);
  height += 80;
  view.rerender(<ChatPanel {...props} messages={[...props.messages, message("ASSISTANT", "More output")]} />);
  expect(scroll).not.toHaveBeenCalled();
  expect(transcript.scrollTop).toBe(800 - distance);
  transcript.scrollTop = height - 400;
  fireEvent.scroll(transcript);
  scroll.mockClear();
  height += 80;
  view.rerender(<ChatPanel {...props} messages={[...props.messages, message("ASSISTANT", "Last output")]} />);
  expect(scroll).toHaveBeenCalled();
  expect(transcript.scrollTop).toBe(height - 400);
});

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
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Run stopped");
    expect(screen.getByRole("status").className).not.toContain("ef-chat__run-notice--error");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/^Working for/)).toBeNull();
    rerender(<ChatPanel {...props} protocolEvents={events} />);
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps elapsed time in the rail and uses a custom stopped label in the notice", () => {
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
    expect(screen.getByText(/^已工作/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("已停止");
    expect(screen.getByRole("status").className).not.toContain("ef-chat__run-notice--error");
    expect(screen.queryByText(/^Run stopped/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a new steer work segment before the active run produces its final response", () => {
    const startedAt = Date.now() - 10_000;
    const originalUser: ChatMessage = {
      ...message("USER", "Start the run"), id: 1, messageId: "user-start", runId: "RUN-STEER",
      createdAt: new Date(startedAt).toISOString(),
    };
    const progress: ChatMessage = {
      ...message("ASSISTANT", "Checking the request"), id: 2, messageId: "step-before-steer", runId: "RUN-STEER",
      createdAt: new Date(startedAt + 100).toISOString(),
    };
    const acceptedAt = Date.now();
    const steerUser: ChatMessage = {
      ...message("USER", "Change direction"), id: 3, messageId: "user-steer", runId: "RUN-STEER",
      createdAt: new Date(acceptedAt).toISOString(),
    };
    const sharedProps = {
      liveAguiAnchorMessageCodes: { "RUN-STEER": "user-start" },
      liveAguiEvents: [
        { type: "RUN_STARTED", runId: "RUN-STEER", threadId: "SESSION-1", timestamp: startedAt },
        { type: "TEXT_MESSAGE_START", runId: "RUN-STEER", threadId: "SESSION-1", timestamp: startedAt + 100, messageId: "step-before-steer" },
        { type: "TEXT_MESSAGE_CONTENT", runId: "RUN-STEER", threadId: "SESSION-1", timestamp: startedAt + 200, messageId: "step-before-steer", delta: "Checking the request" },
      ] satisfies ChatAguiStreamEvent[],
    };
    const view = renderPanel({ messages: [originalUser, progress], ...sharedProps });
    expect(screen.getByText(/^Working for/)).toBeTruthy();

    view.rerender(
      <ChatPanel
        draft="Follow up"
        messages={[originalUser, progress, steerUser]}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        session={activeSession()}
        showHeader={false}
        {...sharedProps}
      />,
    );

    expect(screen.getByText(/^Worked for/)).toBeTruthy();
    expect(screen.getByText(/^Working for/)).toBeTruthy();
  });

  it.each(["AGENT_MODEL_FAILED", "AGENT_RUN_FAILED", "AGENT_RUN_STOPPED"])(
    "keeps code %s red even with cancellation wording",
    (code) => {
      const user = message("USER", "Try a model response");
      renderPanel({ messages: [user], protocolEvents: [{
        type: "RUN_ERROR", runId: "RUN-1", threadId: "SESSION-1", timestamp: Date.parse(user.createdAt) + 1,
        code, message: "Agent run cancelled",
      }] });
      expect(screen.getByText(/^Worked for/)).toBeTruthy();
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
    expect(screen.getByRole("alert").textContent).toContain("Model stream failed");
    if (failedRunId === "CHILD-1") {
      // Separate run rails preserve the child error and the parent's neutral stop.
      expect(screen.getAllByText(/^Worked for/).length).toBeGreaterThan(1);
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
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
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
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
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
    expect(screen.getByText("Compacting context…")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
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
    expect(screen.getByText(/^已工作/)).toBeTruthy();
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

    const activeButton = screen.getByRole("button", { name: /Working for/ });
    expect(activeButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Inspecting the implementation.")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();

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

  it("keeps the run duration at the top and describes a grouped action batch after its thought", () => {
    const user = message("USER", "Inspect and update the project");
    const startedAt = Date.now() - 2_000;
    const base = { runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt };
    const protocolEvents: ChatAguiStreamEvent[] = [
      { ...base, type: "RUN_STARTED" },
      { ...base, timestamp: startedAt + 1, type: "REASONING_START", messageId: "thought-1" },
      { ...base, timestamp: startedAt + 2, type: "REASONING_MESSAGE_CONTENT", messageId: "thought-1", delta: "Inspecting and updating." },
      { ...base, timestamp: startedAt + 3, type: "REASONING_END", messageId: "thought-1" },
      { ...base, timestamp: startedAt + 4, type: "TOOL_CALL_START", toolCallId: "command", toolCallName: "bash_exec", toolCallArgs: { command: "pwd" } },
      { ...base, timestamp: startedAt + 5, type: "TOOL_CALL_RESULT", toolCallId: "command", content: "/project" },
      { ...base, timestamp: startedAt + 6, type: "TOOL_CALL_START", toolCallId: "write", toolCallName: "fs_write_text", toolCallArgs: { path: "src/app.ts", content: "updated" } },
      { ...base, timestamp: startedAt + 7, type: "TOOL_CALL_RESULT", toolCallId: "write", content: "ok" },
      { ...base, timestamp: startedAt + 8, type: "TOOL_CALL_START", toolCallId: "patch", toolCallName: "fs_apply_patch", toolCallArgs: { patch: "*** Begin Patch\n*** Update File: src/view.ts\n*** End Patch" } },
      { ...base, timestamp: startedAt + 9, type: "TOOL_CALL_RESULT", toolCallId: "patch", content: "ok" },
      { ...base, timestamp: startedAt + 10, type: "RUN_FINISHED" },
    ];
    renderPanel({
      messages: [user], protocolEvents,
      workRailLabels: {
        ariaLabel: "Agent work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
        workedFor: duration => `Worked for ${duration}`, workingFor: duration => `Working for ${duration}`,
        tool: { groupSummary: summary => `Executed ${summary.commands} command, edited ${summary.editedFiles} files` },
      },
    });
    const overall = screen.getByRole("button", { name: /Worked for/ });
    expect(screen.queryByText(/Executed 1 command/)).toBeNull();
    fireEvent.click(overall);
    expect(screen.getByText("Inspecting and updating.")).toBeTruthy();
    expect(screen.getByText("Executed 1 command, edited 2 files")).toBeTruthy();
  });

  it("hides reasoning cards when disabled and leaves enabled cards collapsed while running", () => {
    const startedAt = Date.now() - 1_000;
    const messages = [{
      actor: "User", channel: "MAIN_AGENT", content: "Inspect the implementation",
      createdAt: new Date(startedAt).toISOString(), id: 1, messageId: "MSG-USER",
      role: "USER" as const, sessionId: "SESSION-1",
    }];
    const protocolEvents: ChatAguiStreamEvent[] = [
      { runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt, type: "RUN_STARTED" },
      { messageId: "reasoning-1", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 1, type: "REASONING_MESSAGE_START" },
      { delta: "Private reasoning detail", messageId: "reasoning-1", runId: "RUN-1", threadId: "SESSION-1", timestamp: startedAt + 2, type: "REASONING_MESSAGE_CONTENT" },
    ];
    const props = { draft: "", messages, onDraftChange: () => undefined, onSend: () => undefined,
      protocolEvents, session: activeSession(), showHeader: false };
    const { rerender } = render(<ChatPanel {...props} showReasoningCards={false} />);
    expect(screen.getByText("Inspect the implementation", { selector: ".ef-chat__message-body" })).toBeTruthy();
    expect(screen.queryByLabelText("Thinking")).toBeNull();
    expect(screen.queryByText("Private reasoning detail")).toBeNull();

    rerender(<ChatPanel {...props} showReasoningCards />);
    const card = screen.getByLabelText("Thinking");
    const toggle = within(card).getByRole("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(card.querySelector(".ef-chat__rail-entry-body")?.textContent).toContain("Private reasoning detail");
  });

  it("shows answered user questions in user messages outside completed work", () => {
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
    expect(within(workItems).queryByText("First option")).toBeNull();
    expect(screen.getByText("Which direction?").closest("article")?.className).toContain("ef-chat__message--user");
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
      "Enter to queue · ⌘/Ctrl+Enter to steer · Shift+Enter for newline",
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

  it("passes Enter-to-steer preference to the composer", () => {
    const onSend = vi.fn();
    renderPanel({ onSend, sending: true, runningSubmitModes: ["queue", "steer"], runningEnterSubmitMode: "steer" });
    const composer = screen.getByRole("textbox");
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    expect(onSend.mock.calls).toEqual([["steer"], ["queue"]]);
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
      "Enter to queue · Shift+Enter for newline",
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

it("shows an interrupted historical run without claiming it kept working after restart", () => {
  const user = message("USER", "Continue");
  const assistant: ChatMessage = {
    ...message("ASSISTANT", ""),
    runId: "RUN-1",
    history: {
      message: { id: "assistant", runId: "RUN-1", stepId: null, role: "Assistant", content: [], structured: null, status: "Interrupted", createdAtMs: 1 },
      step: null,
      tools: [],
      interactions: [],
      run: { id: "RUN-1", sessionId: "SESSION-1", parentRunId: null, rootRunId: "RUN-1", status: "Interrupted", startedAtMs: 1, finishedAtMs: 1_200_000, error: null },
    },
  };
  renderPanel({ messages: [user, assistant] });
  expect(screen.getByText(/Worked for 20m/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Interrupted");
});


it("shows readable historical answers and interaction tool details without duplicate timings or JSON", () => {
  const interaction:any = {id:"question",prompt:[{type:"Text",text:"请确认需求"}],presentation:{questions:[{id:"uuid",question:"需求方向",options:[{id:"consult",label:"发起会诊"}]}]},response:{answers:{uuid:{option_id:"consult"}}}};
  const tool:any = {id:"tool",callId:"call",toolName:"chat_ask_user",arguments:{questions:[{question:"需求方向"}]},status:"Completed",content:[],structured:{kind:"ask_user",questions:[{id:"uuid"}]},startedAtMs:100,finishedAtMs:155};
  renderPanel({messages:[{id:"u",messageId:"u",sessionId:"SESSION-1",role:"USER",actor:"User",channel:"history",content:"测试",createdAt:"2026-10-09T23:59:00Z"} as any,{id:"m",messageId:"m",sessionId:"SESSION-1",role:"ASSISTANT",actor:"Assistant",channel:"history",content:"",createdAt:"2026-10-10T00:00:00Z",history:{message:{id:"m",role:"Assistant",content:[],structured:null},tools:[tool],interactions:[interaction],step:null,run:null}} as any]});
  expect(screen.queryByText(/55 ms/)).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:/Worked for/}));
  fireEvent.click(screen.getByRole("button",{name:/Ask the user/i}));
  expect(screen.queryByText("Parameters")).toBeNull();
  expect(screen.queryByText(/"kind"/)).toBeNull();
  const details=document.querySelector("[data-history-interaction-id=question]")!;
  expect(details.querySelector("pre")).toBeNull();
  expect(details.textContent).toContain("需求方向");
  expect(details.textContent).toContain("发起会诊");
  expect(details.textContent).not.toContain("uuid");
});


describe("ChatPanel sender attribution", () => {
  it("shows Dude identity on the input side independently of current human", () => {
    renderPanel({ currentUserDisplayName: "Human", messages: [{...message("USER", "Delegated work"), provenance: {sender: {kind: "dude", id:"d", displayName:"Main Dude"}}}] });
    expect(screen.getByText("Main Dude")).toBeTruthy();
    expect(screen.queryByText("Human")).toBeNull();
    expect(screen.getByText("Delegated work", {selector:".ef-chat__message-body"}).closest("article")?.className).toContain("ef-chat__message--user");
  });
});

it("folds structured work when the run completes and keeps final text visible", () => {
  const running = { ...message("ASSISTANT", "Final reply"), history: {
    message: { id: "a", runId: "r", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: "Internal thought" }], structured: null, status: "Running", createdAtMs: 100 },
    step: null, tools: [], interactions: [],
    run: { id: "r", sessionId: "SESSION-1", rootRunId: "r", parentRunId: null, status: "Running", startedAtMs: 100, finishedAtMs: null, error: null },
  } } satisfies ChatMessage;
  const view = renderPanel({ messages: [running] });
  expect(screen.queryByRole("button", { name: "Thinking…" })).toBeNull();
  expect(screen.getByRole("button", { name: /Working for/ }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Internal thought")).toBeTruthy();
  const completed: ChatMessage = { ...running, history: { ...running.history, message: { ...running.history.message, status: "Completed" }, run: { ...running.history.run, status: "Completed", finishedAtMs: 200 } } };
  view.rerender(<ChatPanel allowDraftSession messages={[completed]} draft="" onDraftChange={() => undefined} onSend={() => undefined} />);
  const summary = screen.getByRole("button", { name: /Worked for/ });
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByText("Final reply")).toBeTruthy();
  fireEvent.click(summary);
  expect(summary.getAttribute("aria-expanded")).toBe("true");
});


it("keeps pending questions adjacent to work without empty history sections", () => {
  const steps: ChatMessage[] = Array.from({ length: 6 }, (_, index) => ({
    ...message("ASSISTANT", ""), id: `step-${index}`, messageId: `step-${index}`, runId: "RUN-1",
    history: {
      message: { id: `step-${index}`, runId: "RUN-1", stepId: null, role: "Assistant", content: [{ type: "Reasoning", text: `Work ${index}` }], structured: null, status: "Completed", createdAtMs: index },
      step: null, tools: [], interactions: [],
      run: { id: "RUN-1", sessionId: "SESSION-1", rootRunId: "RUN-1", parentRunId: null, status: "Waiting", startedAtMs: 0, finishedAtMs: null, error: null },
    },
  }));
  const request: ChatUserInputRequest = {
    intro: "Let us get acquainted", answers: null, requestId: "ask", runId: "RUN-1", sessionId: "SESSION-1", assistantMessageId: "step-5", requestedAt: 7, status: "Pending",
    questions: [{ questionId: "name", question: "What should I be called?", options: [{ optionId: "tron", label: "Tron", description: "Use this name" }] }],
  };
  const { container } = renderPanel({ messages: [message("USER", "Wake up"), ...steps], userInputRequest: request, userInputRequests: [request], onAnswerUserInput: vi.fn() });
  expect(screen.getByRole("group", { name: "What should I be called?" })).toBeTruthy();
  expect(container.querySelectorAll(".ef-chat__history-details")).toHaveLength(0);
  expect(container.querySelectorAll(".ef-chat__turn > *")).toHaveLength(2); // User and one grouped work rail.
  expect(screen.queryByRole("button", { name: "Thinking…" })).toBeNull();
  const workSummary = screen.getByRole("button", { name: /Working for|Worked for/ });
  expect(workSummary.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Work 0")).toBeTruthy();
  for (let index = 0; index < 6; index++) expect(screen.getByText(`Work ${index}`)).toBeTruthy();
  expect(container.querySelectorAll(".ef-chat__history-details")).toHaveLength(0);
  expect(container.querySelectorAll(".ef-chat__turn > *")).toHaveLength(2);
});

it("retains structured result content beside text without adding empty history sections", () => {
  const assistant: ChatMessage = { ...message("ASSISTANT", "Result"), history: {
    message: { id: "result", runId: "r", stepId: null, role: "Assistant", content: [{ type: "Json", value: { answer: 42 } }], structured: null, status: "Completed", createdAtMs: 1 },
    step: null, tools: [], interactions: [], run: null,
  } };
  const { container } = renderPanel({ messages: [assistant] });
  expect(container.querySelector(".ef-chat__history-details pre")?.textContent).toContain('"answer": 42');
  expect(screen.getByText("Result")).toBeTruthy();
});

it("restores native annotation metadata and previews reply citations", () => {
  const annotation = { id: "a-1", messageId: "old", selectedText: "Original text", comment: "Explain the check" };
  const encoded = "Please explain";
  renderPanel({draft: encoded, pendingAnnotations: [annotation], messages: [{...message("USER", encoded), annotations: [annotation], messageId: "annotation-user"}, {...message("ASSISTANT", "[Annotation 1](#chat-annotation-a-1) Here is why."), messageId: "annotation-assistant"}]});
  expect(document.querySelector(".ef-chat__message-body")?.textContent).toBe("Please explain");
  expect(document.body.textContent).not.toContain("eliteforge-chat-annotations:v1");
  const citation = screen.getByText("Annotation 1");
  fireEvent.mouseOver(citation);
  expect(screen.getByRole("tooltip").textContent).toContain("Original text");
  expect(screen.getByRole("tooltip").textContent).toContain("Explain the check");
  fireEvent.keyDown(document, {key: "Escape"});
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(citation);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.keyDown(document, {key: "Escape"});
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("keeps both comment references available when the assistant omits inline citations", () => {
  const annotations = [
    {id: "a-1", messageId: "source", selectedText: "First selection", comment: "First comment"},
    {id: "a-2", messageId: "source", selectedText: "Second selection", comment: "Second comment"},
  ];
  renderPanel({draft: "", showHistoryRail: false, messages: [
    {...message("USER", "Explain"), annotations, messageId: "annotated-user"},
    {...message("ASSISTANT", "An answer without citation markup."), messageId: "annotated-reply"},
  ]});
  fireEvent.focus(screen.getByText("Annotation 2"));
  expect(screen.getByRole('tooltip').textContent).toContain('Second selection');
  expect(screen.getByRole('tooltip').textContent).toContain('Second comment');
});

it("edits only an unsent comment, retaining its quote and identity; cancel leaves it unchanged", () => {
  const annotation = {id: 'a-edit', messageId: 'source', selectedText: 'Selected source', comment: 'Original comment'};
  const onDraftChange = vi.fn();
  renderPanel({draft: 'Follow up', pendingAnnotations: [annotation], onPendingAnnotationsChange: onDraftChange});
  fireEvent.click(screen.getByRole('button', {name: 'Annotation 1: Original comment'}));
  const editor = screen.getByRole('dialog', {name: 'Comment'});
  const input = within(editor).getByRole('textbox') as HTMLTextAreaElement;
  expect(input.value).toBe('Original comment');
  expect(editor.textContent).toContain('Selected source');
  fireEvent.input(input, {target: {value: 'Updated comment'}});
  fireEvent.click(within(editor).getByRole('button', {name: 'Save'}));
  expect(onDraftChange.mock.calls[0][0]).toEqual([{...annotation, comment: 'Updated comment'}]);
  onDraftChange.mockClear();
  fireEvent.click(screen.getByRole('button', {name: 'Annotation 1: Original comment'}));
  fireEvent.input(screen.getByRole('dialog').querySelector('textarea')!, {target: {value: 'Discard this'}});
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Cancel'}));
  expect(onDraftChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it("jumps from a reply annotation to its source message with click or keyboard", () => {
  const annotation = {id: 'a-jump', messageId: 'source-message', selectedText: 'Original source', comment: 'Explain'};
  const view = renderPanel({showHistoryRail: false, messages: [
    {...message('ASSISTANT', 'Original source'), messageId: 'source-message'},
    {...message('USER', 'Question'), annotations: [annotation], messageId: 'question'},
    {...message('ASSISTANT', '[Annotation 1](#chat-annotation-a-jump) Answer'), messageId: 'reply'},
  ]});
  const source = document.querySelector('[data-message-id="source-message"]') as HTMLElement;
  source.scrollIntoView = vi.fn();
  const reference = screen.getByRole('button', {name: 'Annotation 1'});
  fireEvent.click(reference);
  expect(source.scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center', inline: 'nearest'});
  expect(source.classList.contains('ef-chat__annotation-source-highlight')).toBe(true);
  expect(document.activeElement).toBe(source);
  fireEvent.keyDown(reference, {key: 'Enter'});
  expect(source.scrollIntoView).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(source.classList.contains('ef-chat__annotation-source-highlight')).toBe(false);
});

it("localizes tool card titles from the host locale and keeps host names first", () => {
  const user = message("USER", "Run a command");
  const startedAt = Date.now() - 1_000;
  const base = { runId: "RUN-LOCALE", threadId: "SESSION-1", timestamp: startedAt };
  const eventsFor = (toolCallId: string, toolCallName: string, toolCallArgs: unknown): ChatAguiStreamEvent[] => [
    { ...base, type: "RUN_STARTED" },
    { ...base, timestamp: startedAt + 1, type: "TOOL_CALL_START", toolCallId, toolCallName, toolCallArgs },
    { ...base, timestamp: startedAt + 2, type: "RUN_FINISHED" },
  ];
  const labels = {
    ariaLabel: "Agent work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
    workedFor: (duration: string) => `Worked for ${duration}`, workingFor: (duration: string) => `Working for ${duration}`,
  };
  const view = renderPanel({ messages: [user], protocolEvents: eventsFor("command", "bash_exec", { command: "cargo test" }), locale: "zh-CN", workRailLabels: labels });
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  expect(view.container.querySelector('.ef-chat__rail-entry-toggle')).toBeNull();
  expect(view.container.textContent).toContain("执行命令 cargo test");
  expect(view.container.textContent).not.toContain("bash_exec");
  view.unmount();

  const readView = renderPanel({ messages: [user], protocolEvents: eventsFor("read", "fs_read_text", { path: "src/main.rs" }), locale: "zh-CN", workRailLabels: labels });
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  expect(readView.container.querySelector('.ef-chat__rail-entry-toggle')).toBeNull();
  expect(readView.container.textContent).toContain("读取文件 src/main.rs");
  expect(readView.container.textContent).not.toContain("fs_read_text");
  readView.unmount();

  const hostView = renderPanel({ messages: [user], protocolEvents: eventsFor("command", "bash_exec", { command: "cargo test" }), locale: "zh-CN",
    workRailLabels: { ...labels, tool: { resolveName: () => "自定义工具" } } });
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  expect(hostView.container.querySelector('.ef-chat__rail-entry-toggle')).toBeNull();
  expect(hostView.container.textContent).toContain("自定义工具 cargo test");
});

it("ignores a host tool name that only echoes the raw tool id", () => {
  const user = message("USER", "Run a command");
  const startedAt = Date.now() - 1_000;
  const base = { runId: "RUN-RAW-HOST", threadId: "SESSION-1", timestamp: startedAt };
  const events: ChatAguiStreamEvent[] = [
    { ...base, type: "RUN_STARTED" },
    { ...base, timestamp: startedAt + 1, type: "TOOL_CALL_START", toolCallId: "command", toolCallName: "bash_exec", toolCallArgs: { command: "cargo test" } },
    { ...base, timestamp: startedAt + 2, type: "RUN_FINISHED" },
  ];
  const labels = {
    ariaLabel: "Agent work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
    workedFor: (duration: string) => `Worked for ${duration}`, workingFor: (duration: string) => `Working for ${duration}`,
  };
  const view = renderPanel({ messages: [user], protocolEvents: events, locale: "zh-CN",
    workRailLabels: { ...labels, tool: { resolveName: (runtimeName: string) => runtimeName } } });
  fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
  expect(view.container.querySelector('.ef-chat__rail-entry-toggle')).toBeNull();
  expect(view.container.textContent).toContain("执行命令 cargo test");
  expect(view.container.textContent).not.toContain("bash_exec");
  view.unmount();
});


import { executingTools, finishedTools, nextThought, nextTools, completedTools } from "../../../contracts/tool-group-phases";
it.each([true, false])("expands current tools, folds on the next thought, and retains all groups under completed work (reasoning=%s)", showReasoningCards => {
  const props={draft:"",messages:[{...message("USER","Inspect files"),createdAt:new Date(900).toISOString()}],
    onDraftChange:()=>undefined,onSend:()=>undefined,session:activeSession(),showHeader:false,showReasoningCards};
  const {container,rerender}=render(<ChatPanel {...props} protocolEvents={executingTools} />);
  const groups=()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Tool run steps"] > .ef-chat__rail-entry-toggle'));
  const states=()=>groups().map(button=>button.getAttribute("aria-expanded"));
  expect(states()).toEqual(["true"]);
  expect(screen.getByRole("button",{name:/Working for/}).getAttribute("aria-expanded")).toBe("true");
  rerender(<ChatPanel {...props} protocolEvents={finishedTools} />);
  expect(states()).toEqual(["true"]);
  fireEvent.click(groups()[0]);
  rerender(<ChatPanel {...props} protocolEvents={[...finishedTools]} />);
  expect(states()).toEqual(["false"]);
  fireEvent.click(groups()[0]);
  rerender(<ChatPanel {...props} protocolEvents={nextThought} />);
  expect(states()).toEqual(["false"]);
  rerender(<ChatPanel {...props} protocolEvents={nextTools} />);
  expect(states()).toEqual(showReasoningCards ? ["false","true"] : ["true"]);
  rerender(<ChatPanel {...props} protocolEvents={completedTools} />);
  const overall=screen.getByRole("button",{name:/Worked for/});
  expect(overall.getAttribute("aria-expanded")).toBe("false");
  expect(groups()).toHaveLength(0);
  fireEvent.click(overall);
  expect(states()).toEqual(showReasoningCards ? ["false","false"] : ["false"]);
  fireEvent.click(groups()[0]);
  expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(showReasoningCards ? 2 : 4);
});
