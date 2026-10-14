// @vitest-environment jsdom
import { createApp, h } from "vue";
import { expect, it } from "vitest";
import ToolResultView from "./components/ToolResultView.vue";
it("renders native media and detection results", () => {
  const container = document.createElement("div");
  const app = createApp({ render: () => h(ToolResultView, { value: JSON.stringify({ content: [{ type: "media", media: { mime_type: "image/png", source: { type: "base64", value: "YWJj" } } }], structured: { result: { ai_confidence: 0.9 } } }) }) });
  try {
    app.mount(container);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,YWJj");
    expect(container.textContent).toContain("ai_confidence: 0.9");
  } finally { app.unmount(); }
});

import ToolCard from "./components/ToolCard.vue";
import type { ToolWorkCard } from "@eliteforge/agent-ui-chat-core";
it.each([false, true])("labels domain expansion as an action, including nested rows (%s)", (nested) => {
  const container = document.createElement("div");
  const card: ToolWorkCard = {
    id: "tool", runId: "run", toolCallId: "call", toolName: "discovery_expand_tool_domain",
    args: { domainCode: "dude" }, ended: true, started: true, firstMillis: 1,
    result: '{"status":"expanded"}', logs: [], parentReasoningId: null,
  };
  const app = createApp({ render: () => h(ToolCard, { card, nested, statusLabel: "Completed" }) });
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__tool-title")?.textContent).toContain("Expand Dude tools");
  } finally { app.unmount(); }
});
