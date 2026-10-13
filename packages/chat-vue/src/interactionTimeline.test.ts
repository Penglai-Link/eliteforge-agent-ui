// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import HistoryWorkRail from "./components/HistoryWorkRail.vue";
import AguiRunWorkRail from "./components/AguiRunWorkRail.vue";
import type { ChatMessage, ChatAguiStreamEvent } from "@eliteforge/agent-ui-chat-core";

it("collapses history work on completion and allows reopening it", async () => {
  const message = { id: "a", messageId: "a", runId: "r", role: "ASSISTANT", history: {
    message: { content: [{ type: "Reasoning", text: "Thought" }], status: "Running", createdAtMs: 100 },
    tools: [], interactions: [], run: { status: "Running", startedAtMs: 100, finishedAtMs: null },
  } } as unknown as ChatMessage;
  const messages = ref([message]);
  const container = document.createElement("div");
  const app = createApp({ render: () => h(HistoryWorkRail, { messages: messages.value }) });
  try {
    app.mount(container);
    (container.querySelector("button") as HTMLButtonElement).click(); await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
    messages.value = [{ ...message, history: { ...message.history!, run: { ...message.history!.run!, status: "Completed", finishedAtMs: 200 } } }];
    await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
    (container.querySelector("button") as HTMLButtonElement).click(); await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
  } finally { app.unmount(); }
});

it("shows resumed execution as working instead of retaining the interrupt completion", async () => {
  const events = ref<ChatAguiStreamEvent[]>([{ type: "RUN_STARTED", runId: "r", timestamp: 100 }, { type: "RUN_FINISHED", runId: "r", timestamp: 200 }]);
  const container = document.createElement("div");
  const app = createApp({ render: () => h(AguiRunWorkRail, { events: events.value }) });
  try {
    app.mount(container);
    expect(container.textContent).toContain("Worked for");
    events.value.push({ type: "RUN_STARTED", runId: "r", timestamp: 300 }); await nextTick();
    expect(container.textContent).toContain("Working for");
    expect(container.textContent).not.toContain("Worked for");
  } finally { app.unmount(); }
});
