// @vitest-environment jsdom

import type { ChatQueuedSubmission, ChatSession } from "@eliteforge/agent-ui-chat-core";
import { createApp, h, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatPanel from "./components/ChatPanel.vue";

let mounted: { app: App; container: HTMLElement } | null = null;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  mounted?.app.unmount();
  mounted?.container.remove();
  mounted = null;
});

function activeSession(): ChatSession {
  return {
    displayName: "Main Agent",
    createdAt: "2026-07-17T00:00:00.000Z",
    id: 1,
    sessionId: "SESSION-1",
    status: "ACTIVE",
    title: "Panel test",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("Vue ChatPanel submit controls", () => {
  it("uses Queue for Enter and exposes Steer only as a command shortcut", async () => {
    const onSend = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const app = createApp({
      render: () => h(ChatPanel, {
        draft: "Follow up",
        messages: [],
        onDraftChange: () => undefined,
        onSend,
        runningSubmitModes: ["queue", "steer"],
        sending: true,
        session: activeSession(),
        showHeader: false,
      }),
    });
    app.mount(container);
    mounted = { app, container };
    await nextTick();

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();
    expect(container.querySelector('button[aria-label="Queue"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Steer"]')).toBeNull();
    expect(
      container.querySelectorAll(".ef-chat__composer-actions button"),
    ).toHaveLength(1);
    expect(container.querySelector('button[aria-label="Stop"]')).not.toBeNull();
    expect(textarea?.placeholder).toBe(
      "Enter 加入队列 · ⌘/Ctrl+Enter 立即调整当前回复 · Shift+Enter 换行",
    );
    expect(textarea?.getAttribute("aria-keyshortcuts")).toBe(
      "Meta+Enter Control+Enter",
    );

    textarea?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
    }));
    textarea?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
      metaKey: true,
    }));
    textarea?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "End",
      metaKey: true,
    }));
    await nextTick();

    expect(onSend).toHaveBeenNthCalledWith(1, "queue");
    expect(onSend).toHaveBeenNthCalledWith(2, "steer");
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("renders editable and withdrawable queued messages above the composer", async () => {
    const onEditQueuedMessage = vi.fn();
    const onRemoveQueuedMessage = vi.fn();
    const queuedMessage: ChatQueuedSubmission = {
      id: "QUEUE-1",
      input: {
        content: "Queued follow-up",
      },
      sessionId: "SESSION-1",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const app = createApp({
      render: () => h(ChatPanel, {
        draft: "",
        messages: [],
        onDraftChange: () => undefined,
        onEditQueuedMessage,
        onRemoveQueuedMessage,
        onSend: vi.fn(),
        queuedLabel: "Queued replies",
        queuedMessages: [queuedMessage],
        session: activeSession(),
        showHeader: false,
      }),
    });
    app.mount(container);
    mounted = { app, container };
    await nextTick();

    const queue = container.querySelector<HTMLElement>(
      ".ef-chat__queued-messages",
    );
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(queue?.textContent).toContain("Queued follow-up");
    expect(
      Boolean(
        queue &&
        textarea &&
        (queue.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ).toBe(true);

    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit queued message"]',
    )?.click();
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove queued message"]',
    )?.click();
    await nextTick();

    expect(onEditQueuedMessage).toHaveBeenCalledWith(
      "QUEUE-1",
      "Queued follow-up",
    );
    expect(onRemoveQueuedMessage).toHaveBeenCalledWith("QUEUE-1");
  });
});
