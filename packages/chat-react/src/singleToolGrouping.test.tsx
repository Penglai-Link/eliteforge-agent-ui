// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyMessages, type ChatMessage, type ChatSession } from "@eliteforge/agent-ui-chat-core";
import { ChatPanel } from "./ChatPanel";
import { subagentEvents, subagentRunningEvents, subagentHistory } from "../../../contracts/subagent-dispatch-title";
import { secondToolStart, singleRunningToolEvents, singleToolEvents, singleToolHistory } from "../../../contracts/single-tool-history";

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, writable: true, value: vi.fn() });
});
const session: ChatSession = { id: 1, sessionId: "SESSION-1", title: "Tools", status: "ACTIVE", createdAt: new Date(1000).toISOString(), updatedAt: new Date(1000).toISOString() };
const user: ChatMessage = { id: "user", messageId: "user", sessionId: session.sessionId, runId: "native", role: "USER", actor: "User", channel: "conversation", content: "List applications", createdAt: session.createdAt };
const props = { draft: "", onDraftChange: vi.fn(), onSend: vi.fn(), session, showHeader: false, showReasoningCards: false };

it.each(["running", "completed", "history", "replay"] as const)("renders one tool directly without a group summary (%s)", mode => {
  const { container } = render(<ChatPanel {...props}
    messages={mode === "history" || mode === "replay" ? historyMessages(singleToolHistory) : [user]}
    protocolEvents={mode === "history" ? [] : mode === "running" ? singleRunningToolEvents : singleToolEvents} />);
  const overall = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
  if (mode !== "running") {
    expect(overall.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".ef-chat__tool-row")).toBeNull();
    fireEvent.click(overall);
  }
  expect(container.querySelector('[aria-label="Tool run steps"]')).toBeNull();
  expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
  expect(container.querySelectorAll(".ef-chat__tool-row--standalone")).toHaveLength(1);
  expect(container.querySelector(".ef-chat__tool-title")?.textContent).toContain("Search tools");
  const tool = container.querySelector<HTMLButtonElement>(".ef-chat__tool-toggle")!;
  fireEvent.click(tool);
  expect(tool.getAttribute("aria-expanded")).toBe("true");
  if (mode !== "running") expect(container.textContent).toContain("definition");
});

it("adds a group only when a second tool starts", () => {
  const view = render(<ChatPanel {...props} messages={[user]} protocolEvents={singleRunningToolEvents} />);
  expect(view.container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
  expect(view.container.querySelectorAll(".ef-chat__tool-row--standalone")).toHaveLength(1);
  view.rerender(<ChatPanel {...props} messages={[user]} protocolEvents={[...singleRunningToolEvents, secondToolStart]} />);
  const group = view.container.querySelector<HTMLButtonElement>(".ef-chat__rail-entry-toggle")!;
  expect(group.getAttribute("aria-expanded")).toBe("true");
  expect(view.container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(2);
  expect(view.container.querySelector(".ef-chat__tool-row--standalone")).toBeNull();
});


it.each(["running", "completed", "history", "replay"] as const)("shows the delegated agent in the collapsed tool title (%s)", mode => {
  const { container } = render(<ChatPanel {...props} locale="zh-CN"
    messages={mode === "history" || mode === "replay" ? historyMessages(subagentHistory) : [user]}
    protocolEvents={mode === "history" ? [] : mode === "running" ? subagentRunningEvents : subagentEvents} />);
  const overall = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
  if (overall.getAttribute("aria-expanded") === "false") fireEvent.click(overall);
  const tool = container.querySelector<HTMLButtonElement>(".ef-chat__tool-toggle")!;
  expect(tool.getAttribute("aria-expanded")).toBe("false");
  expect(tool.textContent).toContain("分派子代理 fast-coding-luna");
});
