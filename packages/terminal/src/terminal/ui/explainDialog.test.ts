// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createExplainDialog } from "./explainDialog";

describe("explain dialog scrolling", () => {
  it("keeps wheel and touch scrolling inside the dialog", () => {
    const dialog = createExplainDialog(
      { status: "success", title: "命令解释", content: "解释内容" },
      {
        onClose: vi.fn(),
        onRefresh: vi.fn(),
        position: { left: 0, top: 0 },
      },
    );
    const outer = document.createElement("div");
    outer.append(dialog);
    document.body.append(outer);
    const outerScrollHandler = vi.fn();
    outer.addEventListener("wheel", outerScrollHandler);
    outer.addEventListener("touchmove", outerScrollHandler);

    const content = dialog.querySelector<HTMLElement>(
      ".ai-terminal-explain-dialog__content",
    );
    expect(content).not.toBeNull();

    content?.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    content?.dispatchEvent(new TouchEvent("touchmove", { bubbles: true }));

    expect(outerScrollHandler).not.toHaveBeenCalled();
    outer.remove();
  });
});
