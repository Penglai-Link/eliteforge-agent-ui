import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";

export interface QueueDragProps {
  composerKey: string;
  draft: string;
  enabled: boolean;
}

export const queuedMessages = ["first", "second", "third"].map(id => ({ id, input: { content: id } }));

/** Run the same pointer lifecycle contract against both framework components. */
export function queueDragContract(mount: (
  props: QueueDragProps,
  reorder: (sourceId: string, targetId: string, draft: string) => void,
) => { container: HTMLElement; update(props: QueueDragProps): Promise<void>; unmount(): void }) {
  let host: ReturnType<typeof mount>;
  let props: QueueDragProps;
  let reorder: Mock<(sourceId: string, targetId: string, draft: string) => void>;
  let rows: HTMLElement[];
  let list: HTMLElement;

  function pointer(target: EventTarget, type: string, y: number, x = 20) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    target.dispatchEvent(event);
  }
  function start(index = 0, y = 20, destinationY = 115) {
    pointer(rows[index].querySelector(".ef-chat__queue-drag-handle")!, "pointerdown", y);
    pointer(window, "pointermove", destinationY);
  }
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    props = { composerKey: "session-a", draft: "", enabled: true };
    reorder = vi.fn();
    host = mount(props, reorder);
    rows = Array.from(host.container.querySelectorAll<HTMLElement>(".ef-chat__queued-message"));
    list = rows[0].parentElement!;
    const rect = (top: number, height: number) => ({ left: 0, right: 200, top, bottom: top + height, width: 200, height, x: 0, y: top, toJSON() {} });
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(0, 120));
    rows.forEach((row, index) => vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rect(index * 40, 40)));
  });
  afterEach(() => { host.unmount(); vi.restoreAllMocks(); });

  it("keeps a drag active across message updates and calls the latest callback on release", async () => {
    start();
    expect(list.dataset.sorting).toBe("true");
    expect(rows[2].dataset.dropPosition).toBe("after");
    expect(reorder).not.toHaveBeenCalled();
    await host.update({ ...props, draft: "stream update" });
    expect(list.dataset.sorting).toBe("true");
    pointer(window, "pointerup", 115);
    expect(reorder).toHaveBeenCalledExactlyOnceWith("first", "third", "stream update");
    expect(list.dataset.sorting).toBeUndefined();
    expect(rows[2].dataset.dropPosition).toBeUndefined();
  });
  it("moves upward with the same target semantics", () => {
    start(2, 100, 5);
    expect(rows[0].dataset.dropPosition).toBe("before");
    pointer(window, "pointerup", 5);
    expect(reorder).toHaveBeenCalledExactlyOnceWith("third", "first", "");
  });
  it("does not reorder for a click without a drag", () => {
    pointer(rows[0].querySelector("button")!, "pointerdown", 20);
    pointer(window, "pointerup", 21);
    expect(reorder).not.toHaveBeenCalled();
  });
  it.each(["session", "disabled"])("cancels when %s changes", async change => {
    start();
    await host.update({ ...props, ...(change === "session" ? { composerKey: "session-b" } : { enabled: false }) });
    expect(list.dataset.sorting).toBeUndefined();
    pointer(window, "pointerup", 115);
    expect(reorder).not.toHaveBeenCalled();
  });
  it.each(["Escape", "blur", "pointercancel", "outside", "unmount"])("cancels on %s and removes drag state", reason => {
    start();
    if (reason === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "pointercancel") pointer(window, "pointercancel", 115);
    if (reason === "outside") pointer(window, "pointerup", 115, 300);
    if (reason === "unmount") host.unmount();
    pointer(window, "pointerup", 115);
    expect(reorder).not.toHaveBeenCalled();
    expect(list.dataset.sorting).toBeUndefined();
    expect(rows[0].dataset.dragging).toBeUndefined();
    expect(rows[2].dataset.dropPosition).toBeUndefined();
  });
  it("supports keyboard sorting in both directions", () => {
    const handle = rows[1].querySelector("button")!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(reorder.mock.calls).toEqual([["second", "first", ""], ["second", "third", ""]]);
  });
  it("preserves native drag and drop sorting", () => {
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { setData() {}, effectAllowed: "none" } });
    rows[2].dispatchEvent(event);
    rows[0].dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    expect(reorder).not.toHaveBeenCalled();
    rows[0].dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(reorder).toHaveBeenCalledExactlyOnceWith("third", "first", "");
  });
}
