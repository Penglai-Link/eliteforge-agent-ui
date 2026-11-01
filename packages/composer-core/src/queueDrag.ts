/** Pointer sorting shared by React and Vue. The host owns the queue and commits
 * its new order only on release; previews never change the send order. */
export function startQueuedMessageDrag(
  event: PointerEvent,
  row: HTMLElement,
  onReorder: (sourceId: string, targetId: string) => void,
): () => void {
  const list = row.parentElement;
  const sourceId = row.dataset.queuedId;
  const view = row.ownerDocument.defaultView;
  if (event.button !== 0 || event.isPrimary === false || !list || !sourceId || !view) return () => {};
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const startY = event.clientY;
  let x = event.clientX;
  let y = event.clientY;
  let active = false;
  let finished = false;
  let frameId = 0;
  let target: HTMLElement | undefined;
  let previousTime = 0;

  function rows() {
    return Array.from(list!.children).filter((node): node is HTMLElement =>
      node instanceof view!.HTMLElement && Boolean((node as HTMLElement).dataset.queuedId));
  }
  function clearTarget() {
    if (target) delete target.dataset.dropPosition;
    target = undefined;
  }
  function preview() {
    clearTarget();
    const bounds = list!.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top - 32 || y > bounds.bottom + 32) return;
    const current = rows();
    const sourceIndex = current.indexOf(row);
    if (sourceIndex < 0) { cancel(); return; }
    const others = current.filter(item => item !== row);
    const nextIndex = others.filter(item => {
      const rect = item.getBoundingClientRect();
      return y > rect.top + rect.height / 2;
    }).length;
    if (nextIndex === sourceIndex) return;
    const movingDown = nextIndex > sourceIndex;
    target = others[movingDown ? nextIndex - 1 : nextIndex];
    if (target) target.dataset.dropPosition = movingDown ? "after" : "before";
  }
  function tick(time: number) {
    if (finished || !active) return;
    if (!row.isConnected) { cancel(); return; }
    const bounds = list!.getBoundingClientRect();
    const edge = Math.min(28, bounds.height / 3);
    if (edge > 0 && x >= bounds.left && x <= bounds.right
      && y >= bounds.top - 32 && y <= bounds.bottom + 32) {
      const speed = y < bounds.top + edge
        ? -Math.min(1, (bounds.top + edge - y) / edge)
        : y > bounds.bottom - edge ? Math.min(1, (y - bounds.bottom + edge) / edge) : 0;
      const elapsed = previousTime ? Math.min(32, time - previousTime) : 16;
      list!.scrollTop += speed * elapsed * 0.45;
    }
    previousTime = time;
    preview();
    if (!finished) frameId = view!.requestAnimationFrame(tick);
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    x = next.clientX;
    y = next.clientY;
    if (!active && Math.abs(y - startY) >= 4) {
      active = true;
      row.dataset.dragging = "true";
      list!.dataset.sorting = "true";
      frameId = view!.requestAnimationFrame(tick);
    }
    if (active) { next.preventDefault(); preview(); }
  }
  function cleanup() {
    if (finished) return;
    finished = true;
    view!.cancelAnimationFrame(frameId);
    clearTarget();
    delete row.dataset.dragging;
    delete list!.dataset.sorting;
    view!.removeEventListener("pointermove", move);
    view!.removeEventListener("pointerup", release);
    view!.removeEventListener("pointercancel", pointerCancel);
    view!.removeEventListener("keydown", keyDown);
    view!.removeEventListener("blur", cancel);
  }
  function cancel() { cleanup(); }
  function pointerCancel(next: PointerEvent) { if (next.pointerId === pointerId) cancel(); }
  function keyDown(next: KeyboardEvent) {
    if (next.key === "Escape") { next.preventDefault(); cancel(); }
  }
  function release(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    x = next.clientX;
    y = next.clientY;
    if (active) preview();
    const bounds = list!.getBoundingClientRect();
    const inside = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    const targetId = active && inside && row.isConnected ? target?.dataset.queuedId : undefined;
    cleanup();
    if (targetId) onReorder(sourceId!, targetId);
  }
  view.addEventListener("pointermove", move, { passive: false });
  view.addEventListener("pointerup", release);
  view.addEventListener("pointercancel", pointerCancel);
  view.addEventListener("keydown", keyDown);
  view.addEventListener("blur", cancel);
  return cancel;
}
