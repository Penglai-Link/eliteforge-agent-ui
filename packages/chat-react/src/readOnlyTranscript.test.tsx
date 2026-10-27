// @vitest-environment jsdom
import { render, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyMessages } from "@eliteforge/agent-ui-chat-core";
import { ChatPanel } from "./ChatPanel";
import { singleToolHistory } from "../../../contracts/single-tool-history";
afterEach(cleanup);
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true, value:vi.fn()}));
it("reuses the full work rail in a read-only transcript without a composer", () => {
  const { container } = render(<ChatPanel draft="" onDraftChange={vi.fn()} onSend={vi.fn()} showHeader={false} showComposer={false}
    session={{id:1,sessionId:"SESSION-1",title:"Child",status:"ACTIVE",createdAt:new Date(1000).toISOString(),updatedAt:new Date(1600).toISOString()}}
    messages={historyMessages(singleToolHistory)} />);
  expect(container.querySelector(".ef-chat__composer")).toBeNull();
  const rail = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
  expect(rail.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(rail);
  expect(container.querySelectorAll(".ef-chat__tool-toggle")).toHaveLength(1);
});
