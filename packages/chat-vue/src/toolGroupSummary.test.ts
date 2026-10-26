// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import type { ToolGroupWorkCard } from "@eliteforge/agent-ui-chat-core";
import ToolGroupCard from "./components/ToolGroupCard.vue";

it("keeps a single-call summary collapsed, opens the active phase, and folds it on the next phase", async () => {
  const autoExpanded = ref(false);
  const card = { id: "group", runId: "run", firstMillis: 1, toolCards: [{
    id: "tool", runId: "run", toolCallId: "call", toolName: "tool_search", args: {}, logs: [],
    result: "ok", started: true, ended: true, firstMillis: 1, parentReasoningId: null,
  }] } satisfies ToolGroupWorkCard;
  const container = document.createElement("div");
  const app = createApp({ render: () => h(ToolGroupCard, { card, autoExpanded: autoExpanded.value }) });
  app.mount(container);
  try {
    await nextTick();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".ef-chat__tool-row")).toBeNull();
    autoExpanded.value = true; await nextTick();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".ef-chat__tool-row")).not.toBeNull();
    autoExpanded.value = false; await nextTick();
    expect(container.querySelector(".ef-chat__tool-row")).toBeNull();
  } finally { app.unmount(); }
});
