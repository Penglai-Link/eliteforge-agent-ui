// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import type { ChatGoalIndicatorProps } from "./ChatGoalIndicator";

beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn(), writable: true }));
afterEach(cleanup);

const labels = { pause: "Pause goal", resume: "Resume goal", restart: "Restart goal", delete: "Delete goal" };
const base: ChatGoalIndicatorProps = { objective: "Complete the migration", status: "Running", label: "Goal", progress: "1 / 20 runs", labels };
const session = { id: 1, sessionId: "s", title: "Chat", status: "ACTIVE" as const, createdAt: "2026-01-01", updatedAt: "2026-01-01" };

function panel(goal: ChatGoalIndicatorProps | null) {
  return <ChatPanel session={session} messages={[]} draft="" onDraftChange={() => {}} onSend={() => {}} goal={goal} />;
}

describe("chat goal indicator", () => {
  it("shows the goal above the composer and calls host actions", () => {
    const pause = vi.fn(); const remove = vi.fn();
    const { container } = render(panel({ ...base, onPause: pause, onDelete: remove }));
    const indicator = screen.getByRole("region", { name: "Goal" });
    expect(indicator.textContent).toContain("Complete the migration");
    expect(indicator.textContent).toContain("1 / 20 runs");
    expect(indicator.compareDocumentPosition(container.querySelector(".ef-composer")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: labels.pause }));
    fireEvent.click(screen.getByRole("button", { name: labels.delete }));
    expect(pause).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
  });
  it("updates available actions, disables pending actions, and disappears when cleared", () => {
    const resume = vi.fn(); const restart = vi.fn();
    const view = render(panel({ ...base, status: "Paused", resumeDisabled: true, onResume: resume }));
    expect((screen.getByRole("button", { name: labels.resume }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(panel({ ...base, status: "Completed", busy: true, onRestart: restart }));
    expect(screen.queryByRole("button", { name: labels.resume })).toBeNull();
    expect((screen.getByRole("button", { name: labels.restart }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(panel(null));
    expect(screen.queryByRole("region", { name: "Goal" })).toBeNull();
  });
});
