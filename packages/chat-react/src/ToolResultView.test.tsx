// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ToolResultView } from "./ToolResultView";
afterEach(cleanup);
it("renders generated images and source links without expanding JSON", () => {
  render(<ToolResultView value={JSON.stringify({ structured: { task_id: "image-task", job: { status: "Completed", images: [{ source: { type: "url", value: "https://example.com/image.png" } }] }, results: [{ title: "Source", url: "https://example.com", snippet: "Evidence" }] } })} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/image.png");
  expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe("https://example.com");
  expect(screen.getByText("image-task")).toBeTruthy();
});
