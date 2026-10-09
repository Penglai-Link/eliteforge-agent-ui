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
