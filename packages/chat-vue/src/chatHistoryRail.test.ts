// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { expect, it, vi } from "vitest";
import ChatPanel from "./components/ChatPanel.vue";

it("tracks the newest turn at the bottom, returns to the viewport position, and navigates", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  const element = document.createElement("div");
  const app = createApp({ render: () => h(ChatPanel, {
    draft: "", onDraftChange: () => {}, onSend: () => {}, showHeader: false, showComposer: false,
    session: { id: 1, sessionId: "session", title: "Chat", status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    messages: ["first", "latest"].map((text, i) => ({ id: i, messageId: text, sessionId: "session", role: "USER" as const, actor: "User", channel: "MAIN_AGENT", content: text, createdAt: "2026-01-01" })),
  }) });
  try {
    app.mount(element);
    await nextTick();
    const transcript = element.querySelector<HTMLElement>(".ef-chat__transcript")!;
    Object.defineProperties(transcript, { clientHeight: { value: 500 }, scrollHeight: { value: 1000 }, scrollTop: { value: 499.5, writable: true } });
    transcript.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    const turns = element.querySelectorAll<HTMLElement>("[data-chat-turn-id]");
    turns[0]!.getBoundingClientRect = () => ({ top: 24 } as DOMRect);
    turns[1]!.getBoundingClientRect = () => ({ top: 400 } as DOMRect);
    transcript.dispatchEvent(new Event("scroll")); await nextTick();
    const markers = element.querySelectorAll<HTMLButtonElement>(".ef-chat-history-rail__marker");
    expect(markers).toHaveLength(2);
    expect(markers[1]!.dataset.active).toBe("true");
    transcript.scrollTop = 300;
    transcript.dispatchEvent(new Event("scroll")); await nextTick();
    expect(markers[0]!.dataset.active).toBe("true");
    markers[1]!.click();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  } finally { app.unmount(); }
});
