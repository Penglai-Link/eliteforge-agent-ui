import { describe, expect, it } from "vitest";
import { toolResultPreview, toolResultUrl } from "./toolResults";
import { historyToolResult, type HistoryToolInvocation } from "./history";
describe("tool result previews", () => {
  it("projects task progress, generated images and search links", () => {
    const preview = toolResultPreview(JSON.stringify({ structured: { task_id: "task", job: { status: "Completed", progress: 100, images: [{ mime_type: "image/png", source: { type: "url", value: "https://example.com/image.png" } }] }, results: [{ title: "Source", url: "https://example.com", snippet: "Evidence" }] } }));
    expect(preview.images[0].url).toBe("https://example.com/image.png");
    expect(preview.links[0].snippet).toBe("Evidence");
    expect(preview.facts).toContainEqual({ label: "progress", value: "100" });
  });
  it("preserves native and persisted media", () => {
    for (const content of [[{ type: "media", media: { mime_type: "image/png", source: { type: "base64", value: "YWJj" } } }], [{ type: "Media", mimeType: "image/png", source: { type: "base64", value: "YWJj" } }]]) {
      expect(toolResultPreview(JSON.stringify({ content })).images[0].url).toBe("data:image/png;base64,YWJj");
    }
    const tool = { content: [{ type: "Media", mimeType: "image/png", source: { type: "url", value: "/attachment.png" }, name: null }], structured: null, resultReference: null } as HistoryToolInvocation;
    expect(toolResultPreview(historyToolResult(tool)).images[0].url).toBe("/attachment.png");
  });
  it("shows confidence and rejects unsafe URLs", () => {
    expect(toolResultPreview(JSON.stringify({ result: { ai_confidence: 0.9 } })).facts).toContainEqual({ label: "ai_confidence", value: "0.9" });
    for (const url of ["javascript:alert(1)", "data:image/svg+xml;base64,YWJj", "//evil.example", "/\\evil.example"]) expect(toolResultUrl(url, true)).toBeNull();
    expect(toolResultPreview("plain result")).toEqual({ texts: [], images: [], links: [], facts: [] });
  });
});
