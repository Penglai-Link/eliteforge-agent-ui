// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createChatTerminalI18n } from "../i18n";
import { createModelSessionHost, renderModelSession } from "./modelSession";

describe("model session scrolling", () => {
  it("keeps scrolling inside the card while it has room to scroll", () => {
    const outer = document.createElement("div");
    const modelSessionHost = createModelSessionHost();
    const content = document.createElement("div");
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });
    modelSessionHost.append(content);
    outer.append(modelSessionHost);
    document.body.append(outer);

    const outerScrollHandler = vi.fn();
    outer.addEventListener("wheel", outerScrollHandler);
    outer.addEventListener("touchmove", outerScrollHandler);

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      deltaY: 40,
    });
    const touchEvent = new TouchEvent("touchmove", { bubbles: true });
    content.dispatchEvent(wheelEvent);
    content.dispatchEvent(touchEvent);

    expect(outerScrollHandler).not.toHaveBeenCalled();
    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(touchEvent.defaultPrevented).toBe(false);
    outer.remove();
  });

  it("lets the outer terminal scroll when the card has no room to consume it", () => {
    const outer = document.createElement("div");
    const modelSessionHost = createModelSessionHost();
    const content = document.createElement("div");
    modelSessionHost.append(content);
    outer.append(modelSessionHost);
    document.body.append(outer);

    const outerScrollHandler = vi.fn();
    outer.addEventListener("wheel", outerScrollHandler);
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      deltaY: 40,
    });
    content.dispatchEvent(wheelEvent);

    expect(outerScrollHandler).toHaveBeenCalledOnce();
    expect(wheelEvent.defaultPrevented).toBe(false);
    outer.remove();
  });

  it("lets the outer terminal scroll when the card is already at its boundary", () => {
    const outer = document.createElement("div");
    const modelSessionHost = createModelSessionHost();
    const content = document.createElement("div");
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    modelSessionHost.append(content);
    outer.append(modelSessionHost);
    document.body.append(outer);

    const outerScrollHandler = vi.fn();
    outer.addEventListener("wheel", outerScrollHandler);
    content.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, deltaY: 40 }),
    );

    expect(outerScrollHandler).toHaveBeenCalledOnce();
    outer.remove();
  });
});

describe("renderModelSession agent activity", () => {
  it("renders an activity snapshot when reasoning cards have not started yet", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "en-US" });

    renderModelSession(
      host,
      {
        activityEvents: [
          {
            activity: "THINKING",
            runId: "run-1",
            summary: "Inspecting the workspace.",
            timestamp: 1,
            type: "ACTIVITY_SNAPSHOT",
          },
        ],
        activityStartedAt: 0,
        activityNow: 3_000,
        activityComplete: false,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.textContent).toContain("Thinking");
    expect(host.textContent).toContain("Thinking 0m 3s");
    expect(host.querySelector(".ai-terminal-model-session__activity-status--running")).toBeTruthy();
  });

  it("shows a failed state for a snapshot-only RUN_ERROR", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "zh-CN" });

    renderModelSession(
      host,
      {
        activityEvents: [
          { activity: "THINKING", runId: "run-error", summary: "正在检查", timestamp: 1, type: "ACTIVITY_SNAPSHOT" },
          { code: "AGENT_MODEL_FAILED", runId: "run-error", timestamp: 2, type: "RUN_ERROR" },
        ],
        activityStartedAt: 0,
        activityNow: 2_000,
        activityComplete: true,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.textContent).toContain("运行失败");
    expect(host.textContent).toContain("运行失败 0分钟 2秒");
    expect(host.textContent).not.toContain("耗时");
    expect(host.querySelector("summary svg")).toBeNull();
  });

  it("shows processed time after reasoning ends while the model is still running", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "en-US" });

    renderModelSession(
      host,
      {
        activityEvents: [
          { runId: "run-1", timestamp: 1, type: "REASONING_START" },
          { delta: "planning", runId: "run-1", timestamp: 1.5, type: "REASONING_MESSAGE_CONTENT" },
          { runId: "run-1", timestamp: 2, type: "REASONING_END" },
        ],
        activityStartedAt: 0,
        activityNow: 5_000,
        activityComplete: false,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.textContent).toContain("Processed 0m 5s");
    expect(host.textContent).not.toContain("Thinking");
    expect(host.querySelector(".ai-terminal-model-session__activity-status--running")).toBeTruthy();
  });

  it("renders reasoning summaries and grouped tool details without raw reasoning", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "en-US" });

    renderModelSession(
      host,
      {
        activityEvents: [
          { runId: "run-1", timestamp: 1, type: "REASONING_START" },
          {
            delta: "internal chain of thought",
            runId: "run-1",
            timestamp: 2,
            type: "REASONING_TEXT_CONTENT",
          },
          { runId: "run-1", timestamp: 3, type: "REASONING_END" },
          {
            runId: "run-1",
            timestamp: 0,
            toolCallArgs: { path: "/workspace" },
            toolCallId: "tool-1",
            toolCallName: "workspace.inspect",
            type: "TOOL_CALL_START",
          },
          {
            delta: [{ op: "add", path: "/logs/-", value: "Loaded workspace" }],
            runId: "run-1",
            timestamp: 5,
            toolCallId: "tool-1",
            toolCallName: "workspace.inspect",
            type: "ACTIVITY_DELTA",
          },
          {
            content: "Workspace context loaded.",
            runId: "run-1",
            timestamp: 6,
            toolCallId: "tool-1",
            toolCallName: "workspace.inspect",
            type: "TOOL_CALL_RESULT",
          },
          { runId: "run-1", timestamp: 7, toolCallId: "tool-1", type: "TOOL_CALL_END" },
        ],
        activityStartedAt: 0,
        activityNow: 0,
        activityComplete: true,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.textContent).toContain("Elapsed 0m 0s");
    expect(host.textContent).toContain("Tools called 1");
    expect(host.textContent).toContain("workspace.inspect");
    expect(host.textContent).not.toContain("Loaded workspace");
    expect(host.textContent).toContain("Workspace context loaded.");
    expect(host.textContent).not.toContain("internal chain of thought");
    expect(host.querySelector("summary svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(host.querySelector("details")?.hasAttribute("open")).toBe(false);
    const summaries = [...host.querySelectorAll("summary")].map((summary) => summary.textContent ?? "");
    expect(summaries[0]).toContain("Elapsed 0m 0s");
    expect(summaries[1]).toContain("Tools called 1");
    expect(host.querySelector(".ai-terminal-model-session__activity-status--running")).toBeNull();
    expect(host.querySelectorAll(".ai-terminal-model-session__activity > details")).toHaveLength(1);
    expect(host.querySelector(".ai-terminal-model-session__activity-item--nested")).toBeTruthy();
    (host.querySelector("summary") as HTMLElement).click();
    expect(host.querySelector("details")?.open).toBe(true);
  });

  it("shows a failed state when the run emits RUN_ERROR", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "zh-CN" });

    renderModelSession(
      host,
      {
        activityEvents: [
          { runId: "run-error", timestamp: 1, type: "REASONING_START" },
          { delta: "正在检查", runId: "run-error", timestamp: 2, type: "REASONING_MESSAGE_CONTENT" },
          { code: "AGENT_MODEL_FAILED", runId: "run-error", timestamp: 3, type: "RUN_ERROR" },
        ],
        activityStartedAt: 0,
        activityNow: 3_000,
        activityComplete: true,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.textContent).toContain("运行失败");
    expect(host.textContent).toContain("运行失败 0分钟 3秒");
    expect(host.textContent).not.toContain("耗时");
    expect(host.querySelector("summary svg")).toBeNull();
  });

  it("keeps tool details collapsed while a session is running", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "en-US" });

    renderModelSession(
      host,
      {
        activityEvents: [
          {
            runId: "run-1",
            timestamp: 1,
            toolCallId: "tool-1",
            toolCallName: "workspace.inspect",
            type: "TOOL_CALL_START",
          },
        ],
        activityStartedAt: 0,
        activityNow: 1_000,
        activityComplete: false,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    (host.querySelector("summary") as HTMLElement).click();

    expect(host.querySelector("details")?.open).toBe(false);
  });

  it("renders one thinking state for repeated empty reasoning starts", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "en-US" });

    renderModelSession(
      host,
      {
        activityEvents: [
          { runId: "run-1", timestamp: 1, type: "REASONING_START" },
          { runId: "run-1", timestamp: 2, type: "REASONING_START" },
        ],
        activityStartedAt: 0,
        activityNow: 2_000,
        activityComplete: false,
        commandStates: new Map(),
        i18n,
        tokens: [],
      },
      {
        onDraftCommandChange: vi.fn(),
        onExecuteCommand: vi.fn(),
        onCancelCommandEdit: vi.fn(),
        onRejectCommand: vi.fn(),
        onSaveCommandEdit: vi.fn(),
        onStartEditCommand: vi.fn(),
      },
    );

    expect(host.querySelectorAll("summary")).toHaveLength(1);
    expect(host.textContent).toContain("Thinking");
  });

  it("renders answered user questions in the session activity", () => {
    const host = document.createElement("div");
    const i18n = createChatTerminalI18n({ locale: "zh-CN" });

    renderModelSession(host, {
      activityEvents: [],
      activityStartedAt: 0,
      activityNow: 0,
      activityComplete: true,
      commandStates: new Map(),
      i18n,
      tokens: [],
      userInputHistory: [{
        request: {
          requestId: "INPUT-1",
          intro: "",
          questions: [{
            questionId: "Q-1",
            question: "你想测试什么？",
            options: [{ optionId: "FILE", label: "文件操作" }],
          }],
        },
        answers: [{
          questionId: "Q-1",
          answerKind: "Option",
          optionId: "FILE",
          otherText: null,
        }],
      }],
    }, {
      onDraftCommandChange: vi.fn(),
      onExecuteCommand: vi.fn(),
      onCancelCommandEdit: vi.fn(),
      onRejectCommand: vi.fn(),
      onSaveCommandEdit: vi.fn(),
      onStartEditCommand: vi.fn(),
    });

    expect(host.textContent).toContain("已询问 1 个问题");
    expect(host.textContent).toContain("你想测试什么？");
    expect(host.textContent).toContain("文件操作");
  });
});
