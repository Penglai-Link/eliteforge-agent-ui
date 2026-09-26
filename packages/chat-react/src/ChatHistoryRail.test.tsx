// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ChatMessage, TranscriptPresentation } from "@eliteforge/agent-ui-chat-core";
import { afterEach, describe, expect, it } from "vitest";
import { createRef } from "react";

import { ChatHistoryRail } from "./ChatHistoryRail";

afterEach(() => {
  cleanup();
});

function createPresentation(): TranscriptPresentation {
  return {
    debugEventsByRunCode: new Map(),
    waitingForModelAnchorMessageCode: "",
    workRailsByMessageCode: new Map(),
  };
}

function createMessage(input: Partial<ChatMessage> & Pick<ChatMessage, "messageId" | "role" | "content">): ChatMessage {
  return {
    actor: input.role === "USER" ? "User" : "Assistant",
    channel: "MAIN_AGENT",
    createdAt: "2026-07-01T00:00:00.000Z",
    id: Math.random(),
    messageId: input.messageId,
    role: input.role,
    sessionId: "SESSION-1",
    content: input.content,
    ...input,
  };
}

describe("ChatHistoryRail", () => {
  it("renders a two-line preview when the turn contains an assistant reply", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = '<section data-chat-turn-id="turn-user-1"></section>';
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "codex 是怎么实现的" }),
          createMessage({ messageId: "assistant-1", role: "ASSISTANT", content: "Codex 的这类左侧历史轨道..." }),
        ]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const marker = screen.getByRole("button", { name: "codex 是怎么实现的" });
    fireEvent.mouseEnter(marker);

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("codex 是怎么实现的")).toBeTruthy();
    expect(within(tooltip).getByText((content) => content.includes("Codex 的这类左侧历史轨道"))).toBeTruthy();
  });

  it("renders markdown tables in the assistant preview", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = '<section data-chat-turn-id="turn-user-1"></section>';
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "直接在会话中显示表格" }),
          createMessage({
            messageId: "assistant-1",
            role: "ASSISTANT",
            content: "| 姓名 | 成绩 |\n|------|------|\n| 张三 | 90 |\n| 李四 | 85 |",
          }),
        ]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const marker = screen.getByRole("button", { name: "直接在会话中显示表格" });
    fireEvent.mouseEnter(marker);

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByRole("table")).toBeTruthy();
    expect(within(tooltip).getByRole("columnheader", { name: "姓名" })).toBeTruthy();
    expect(within(tooltip).getByRole("cell", { name: "张三" })).toBeTruthy();
  });

  it("renders a single-line preview when the turn has work activity but no assistant reply", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = '<section data-chat-turn-id="turn-user-1"></section>';
    transcriptRef.current = transcript;

    const presentation = createPresentation();
    presentation.workRailsByMessageCode.set("user-1", [{ events: [], firstMillis: 0, runId: "run-1" }]);

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "会话页面想实现类似的历史功能" }),
        ]}
        presentation={presentation}
        transcriptRef={transcriptRef}
      />,
    );

    const marker = screen.getByRole("button", { name: "会话页面想实现类似的历史功能" });
    fireEvent.mouseEnter(marker);

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("会话页面想实现类似的历史功能")).toBeTruthy();
    expect(within(tooltip).queryByText((content) => content.includes("Codex"))).toBeNull();
  });

  it("applies proximity width transition only while a marker is hovered", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = `
      <section data-chat-turn-id="turn-user-1"></section>
      <section data-chat-turn-id="turn-user-2"></section>
      <section data-chat-turn-id="turn-user-3"></section>
    `;
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "第一条" }),
          createMessage({ messageId: "assistant-1", role: "ASSISTANT", content: "答复一" }),
          createMessage({ messageId: "user-2", role: "USER", content: "第二条" }),
          createMessage({ messageId: "assistant-2", role: "ASSISTANT", content: "答复二" }),
          createMessage({ messageId: "user-3", role: "USER", content: "第三条" }),
          createMessage({ messageId: "assistant-3", role: "ASSISTANT", content: "答复三" }),
        ]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const firstMarker = screen.getByRole("button", { name: "第一条" });
    const secondMarker = screen.getByRole("button", { name: "第二条" });

    expect(firstMarker.style.width).toBe("14px");
    expect(secondMarker.style.width).toBe("6px");

    fireEvent.mouseEnter(secondMarker);

    expect(Number.parseFloat(secondMarker.style.width)).toBeGreaterThan(
      Number.parseFloat(firstMarker.style.width),
    );
    expect(firstMarker.getAttribute("data-active")).toBe("false");

    fireEvent.mouseLeave(secondMarker);

    expect(secondMarker.style.width).toBe("6px");
  });

  it("temporarily clears scroll-based active highlight while hovering another marker", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = `
      <section data-chat-turn-id="turn-user-1"></section>
      <section data-chat-turn-id="turn-user-2"></section>
    `;
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "第一条" }),
          createMessage({ messageId: "assistant-1", role: "ASSISTANT", content: "答复一" }),
          createMessage({ messageId: "user-2", role: "USER", content: "第二条" }),
          createMessage({ messageId: "assistant-2", role: "ASSISTANT", content: "答复二" }),
        ]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const firstMarker = screen.getByRole("button", { name: "第一条" });
    const secondMarker = screen.getByRole("button", { name: "第二条" });

    expect(firstMarker.getAttribute("data-active")).toBe("true");

    fireEvent.mouseEnter(secondMarker);

    expect(firstMarker.getAttribute("data-active")).toBe("false");
    expect(secondMarker.getAttribute("data-hovered")).toBe("true");

    fireEvent.mouseLeave(secondMarker);

    expect(firstMarker.getAttribute("data-active")).toBe("true");
  });

  it("keeps the nearest marker hovered while moving through the gap between markers", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = `
      <section data-chat-turn-id="turn-user-1"></section>
      <section data-chat-turn-id="turn-user-2"></section>
      <section data-chat-turn-id="turn-user-3"></section>
    `;
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[
          createMessage({ messageId: "user-1", role: "USER", content: "第一条" }),
          createMessage({ messageId: "assistant-1", role: "ASSISTANT", content: "答复一" }),
          createMessage({ messageId: "user-2", role: "USER", content: "第二条" }),
          createMessage({ messageId: "assistant-2", role: "ASSISTANT", content: "答复二" }),
          createMessage({ messageId: "user-3", role: "USER", content: "第三条" }),
          createMessage({ messageId: "assistant-3", role: "ASSISTANT", content: "答复三" }),
        ]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const markers = screen.getAllByRole("button");
    const rail = screen.getByLabelText("Chat history").parentElement as HTMLElement;

    markers.forEach((marker, index) => {
      Object.defineProperty(marker, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          bottom: 20 + index * 16,
          height: 2,
          left: 0,
          right: 6,
          top: 18 + index * 16,
          width: 6,
          x: 0,
          y: 18 + index * 16,
          toJSON: () => ({}),
        }),
      });
    });

    Object.defineProperty(rail, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 120,
        height: 120,
        left: 0,
        right: 24,
        top: 0,
        width: 24,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent(window, new Event("resize"));
    fireEvent.mouseMove(rail, { clientY: 35 });
    expect(markers[1]?.getAttribute("data-hovered")).toBe("true");

    fireEvent.mouseMove(rail, { clientY: 47 });
    expect(markers[2]?.getAttribute("data-hovered")).toBe("true");
  });

  it("keeps the history marker label visually hidden", () => {
    const transcriptRef = createRef<HTMLElement>();
    const transcript = document.createElement("section");
    transcript.innerHTML = '<section data-chat-turn-id="turn-user-1"></section>';
    transcriptRef.current = transcript;

    render(
      <ChatHistoryRail
        messages={[createMessage({ messageId: "user-1", role: "USER", content: "你好" })]}
        presentation={createPresentation()}
        transcriptRef={transcriptRef}
      />,
    );

    const marker = screen.getByRole("button", { name: "你好" });
    const screenReaderLabel = marker.querySelector(".ef-chat-history-rail__sr-only");
    expect(screenReaderLabel?.textContent).toBe("你好");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
