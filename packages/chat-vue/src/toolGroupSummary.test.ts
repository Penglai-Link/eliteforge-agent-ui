// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import type { ToolGroupWorkCard } from "@eliteforge/agent-ui-chat-core";
import ToolGroupCard from "./components/ToolGroupCard.vue";

it("keeps a single tool directly accessible across phase changes", async () => {
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
    expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
    expect(container.querySelector(".ef-chat__tool-row--standalone")).not.toBeNull();
    const tool = container.querySelector<HTMLButtonElement>(".ef-chat__tool-toggle")!;
    tool.click(); await nextTick();
    expect(tool.getAttribute("aria-expanded")).toBe("true");
    autoExpanded.value = true; await nextTick();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
    expect(tool.getAttribute("aria-expanded")).toBe("true");
    autoExpanded.value = false; await nextTick();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
    expect(tool.getAttribute("aria-expanded")).toBe("true");
  } finally { app.unmount(); }
});
