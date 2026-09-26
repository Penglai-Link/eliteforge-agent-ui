// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ExplainController } from "./explainController";

function setup(onExplainCancel = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  let signal: AbortSignal | undefined;
  const onExplain = vi.fn((_payload, context) => {
    signal = context.signal;
    return new Promise<string>(() => {});
  });
  const controller = new ExplainController({
    host: () => host,
    onCancel: onExplainCancel,
    onExplain,
  });

  return {
    controller,
    host,
    onExplain,
    get signal() {
      return signal;
    },
  };
}

describe("ExplainController cancellation", () => {
  it("aborts and stops the request when the close button is clicked", async () => {
    const onCancel = vi.fn();
    const harness = setup(onCancel);
    void harness.controller.open("ls", "output", { left: 0, top: 0, size: 16 });
    await vi.waitFor(() => expect(harness.onExplain).toHaveBeenCalled());

    harness.host
      .querySelector<HTMLButtonElement>(
        ".ai-terminal-explain-dialog__icon-button:nth-child(2)",
      )
      ?.click();

    expect(harness.signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledWith(harness.signal));
    expect(harness.host.querySelector(".ai-terminal-explain-dialog")).toBeNull();
  });

  it("aborts and stops the request when clicking outside the dialog", async () => {
    const onCancel = vi.fn();
    const harness = setup(onCancel);
    void harness.controller.open("ls", "output", { left: 0, top: 0, size: 16 });
    await vi.waitFor(() => expect(harness.onExplain).toHaveBeenCalled());

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(harness.signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledWith(harness.signal));
    expect(harness.host.querySelector(".ai-terminal-explain-dialog")).toBeNull();
  });

  it("does not keep the dialog open when server cancellation fails", async () => {
    const onCancel = vi.fn().mockRejectedValue(new Error("stop failed"));
    const harness = setup(onCancel);
    void harness.controller.open("ls", "output", { left: 0, top: 0, size: 16 });
    await vi.waitFor(() => expect(harness.onExplain).toHaveBeenCalled());

    harness.controller.close();

    expect(harness.signal?.aborted).toBe(true);
    expect(harness.host.querySelector(".ai-terminal-explain-dialog")).toBeNull();
    await vi.waitFor(() => expect(onCancel).toHaveBeenCalled());
  });
});
