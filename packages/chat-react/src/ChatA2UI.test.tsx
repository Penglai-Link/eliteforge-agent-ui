// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CATALOG_ID, VERSION } from "@eliteforge/agent-ui-a2ui-core";
import type { ChatMessage } from "@eliteforge/agent-ui-chat-core";
import { ChatA2UI } from "./ChatA2UI";
afterEach(cleanup);
it("renders persisted envelopes and updates the surface", () => {
  const messages = [
    { version: VERSION, createSurface: { surfaceId: "card", catalogId: CATALOG_ID } },
    { version: VERSION, updateComponents: { surfaceId: "card", components: [{ id: "root", component: "Text", text: "Hello UI" }] } },
  ];
  const message = { a2ui: { messages } } as ChatMessage;
  const view = render(<ChatA2UI message={message} />);
  expect(screen.getByText("Hello UI")).toBeTruthy();
  view.rerender(<ChatA2UI message={{ ...message, a2ui: { messages: [...messages, { version: VERSION, deleteSurface: { surfaceId: "card" } }] } }} />);
  expect(screen.queryByText("Hello UI")).toBeNull();
});
it("isolates malformed protocol from the transcript", () => {
  render(<ChatA2UI message={{ a2ui: { messages: [{}] } } as ChatMessage} />);
  expect(screen.getByRole("alert").textContent).toContain("Invalid A2UI");
});
