// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultFloatingState } from "@eliteforge/agent-ui-chat-core";
import { ensureTestLocalStorage } from "./testLocalStorage";
import { ChatWindow } from "./ChatWindow";

beforeEach(() => {
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderWindow(props: Partial<ComponentProps<typeof ChatWindow>> = {}) {
  return render(
    <ChatWindow
      createSessionLabel="Create session"
      draft=""
      messages={[]}
      onCreateSession={() => undefined}
      onDraftChange={() => undefined}
      onSend={() => undefined}
      sendDisabled
      session={null}
      title="Chat"
      titleSubtitle="AI assistant"
      {...props}
    />,
  );
}

describe("ChatWindow", () => {
  it("renders inspection screenshots and the annotation count in a user message", () => {
    const screenshot = "data:image/png;base64,AA==";
    renderWindow({
      messages: [
        {
          actor: "User",
          attachments: [
            {
              id: "inspection-1",
              imageUrl: screenshot,
              kind: "inspection",
              metadata: {},
              summary: "Selected page element",
            },
          ],
          channel: "MAIN_AGENT",
          content: "Please inspect this element",
          createdAt: "2026-07-16T00:00:00.000Z",
          id: 1,
          messageId: "MESSAGE-1",
          role: "USER",
          sessionId: "SESSION-1",
        },
      ],
      sendDisabled: false,
      session: {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: 1,
        sessionId: "SESSION-1",
        status: "ACTIVE",
        title: "Inspection chat",
        updatedAt: "2026-07-16T00:00:00.000Z",
      },
    });

    const annotationRegion = screen.getByRole("region", { name: "1 annotation" });
    const userMessage = document.querySelector("article.ef-chat__message--user");
    const userMessageEntry = userMessage?.parentElement;

    expect(annotationRegion).toBeTruthy();
    expect(userMessage?.textContent).toContain("Please inspect this element");
    expect(screen.getByText("1 annotation")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Selected page element" }).getAttribute("src")).toBe(screenshot);
    expect(userMessage?.contains(annotationRegion)).toBe(false);
    expect(annotationRegion.nextElementSibling).toBe(userMessageEntry);
  });

  it("persists collapse state in uncontrolled mode", () => {
    renderWindow({ storageKey: "eliteforge.agent-ui.chat.window.test.uncontrolled" });

    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));

    expect(screen.getByRole("button", { name: "Expand chat" })).toBeTruthy();
    expect(window.localStorage.getItem("eliteforge.agent-ui.chat.window.test.uncontrolled")).toContain("\"collapsed\":true");
  });

  it("delegates state changes through onStateChange in controlled mode", () => {
    const onStateChange = vi.fn();
    renderWindow({
      onStateChange,
      state: defaultFloatingState,
    });

    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultFloatingState,
      collapsed: true,
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("normalizes controlled floating state into the viewport on mount", () => {
    const onStateChange = vi.fn();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
      writable: true,
    });

    renderWindow({
      onStateChange,
      state: {
        ...defaultFloatingState,
        height: 520,
        x: 400,
        y: 200,
      },
    });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultFloatingState,
      height: 520,
      x: 324,
      y: 84,
    });
  });
});

it("keeps New chat available by default and hides it for persistent sessions", () => {
  const view = renderWindow();
  expect(screen.getByRole("button", {name:"New chat"})).toBeTruthy();
  view.unmount(); renderWindow({showNewSession:false});
  expect(screen.queryByRole("button", {name:"New chat"})).toBeNull();
});
