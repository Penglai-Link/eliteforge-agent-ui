import type { ChatMessage } from "./types";
import {
  defaultChatAnnotationLabels,
  type ChatAnnotation,
  type ChatAnnotationLabels,
} from "./annotationTypes";

/** Stored in ordinary message content so adapters persist and deliver the same context. */
export { defaultChatAnnotationLabels, zhChatAnnotationLabels } from "./annotationTypes";
export type { ChatAnnotation, ChatAnnotationLabels } from "./annotationTypes";

/** Resolve citations only inside the originating user turn, including streamed replies. */
export function chatAnnotationsByMessage(messages: readonly ChatMessage[]): Map<string, ChatAnnotation[]> {
  const result = new Map<string, ChatAnnotation[]>();
  let annotations: ChatAnnotation[] = [];
  for (const message of messages) {
    if (message.role === "USER" && !message.interactionResponse) annotations = message.annotations ?? [];
    result.set(message.messageId, annotations);
  }
  return result;
}

export function chatAnnotationTooltip(annotation: ChatAnnotation, labels: ChatAnnotationLabels = defaultChatAnnotationLabels): string {
  return `${labels.selectedText}:\n${annotation.selectedText}\n\n${labels.userComment}:\n${annotation.comment}`;
}

export function chatAnnotationForHref(href: string | undefined, annotations: readonly ChatAnnotation[]): ChatAnnotation | undefined {
  return annotations.find(item => href === `#chat-annotation-${item.id}`);
}

/** Selection is restricted to a single message body, never controls, tools or the composer. */
export function selectedChatText(root: HTMLElement): { messageId: string; selectedText: string; rect: DOMRect } | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const element = (node: Node) => node.nodeType === 1 ? node as Element : node.parentElement;
  const start = element(range.startContainer)?.closest<HTMLElement>("[data-chat-annotation-source]");
  const end = element(range.endContainer)?.closest<HTMLElement>("[data-chat-annotation-source]");
  if (!start || start !== end || !root.contains(start) || start.closest('[data-streaming="true"]')) return null;
  const selectedText = selection.toString();
  if (!selectedText.trim()) return null;
  const messageId = start.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
  return messageId ? { messageId, selectedText, rect: range.getBoundingClientRect() } : null;
}

/** Body portals retain the originating chat's scoped theme. */
function inheritAnnotationTheme(source: HTMLElement, overlay: HTMLElement) {
  const style = source.ownerDocument.defaultView?.getComputedStyle(source);
  if (!style) return;
  for (const name of ["--agent-ui-chat-primary", "--agent-ui-chat-on-primary", "--color-primary", "--color-on-primary", "--color-on-surface", "--color-on-surface-variant", "--color-surface-container-lowest", "--color-outline-variant", "--font-sans"]) {
    const value = style.getPropertyValue(name).trim();
    if (value) overlay.style.setProperty(name, value);
    else overlay.style.removeProperty(name);
  }
}

/** Shared selection popover for React/Vue; no framework-owned DOM is modified. */
export function mountChatAnnotationSelection(root: HTMLElement, onAdd: (annotation: ChatAnnotation) => void, labels: ChatAnnotationLabels = defaultChatAnnotationLabels): () => void {
  const doc = root.ownerDocument;
  const panel = doc.createElement("div");
  panel.className = "ef-chat__selection-comment";
  panel.dataset.mode = "toolbar";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", labels.comment);
  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "ef-chat__selection-trigger";
  const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15"); icon.setAttribute("height", "15");
  icon.setAttribute("fill", "none"); icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.7"); icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round"); icon.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z M7 7h10 M7 11h6");
  icon.append(path);
  trigger.append(icon, doc.createTextNode(labels.comment));
  const quote = doc.createElement("blockquote");
  const input = doc.createElement("textarea");
  input.placeholder = labels.commentPlaceholder;
  input.setAttribute("aria-label", input.placeholder);
  const save = doc.createElement("button");
  save.type = "button";
  save.className = "ef-chat__selection-save";
  save.textContent = labels.addToMessage;
  save.disabled = true;
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.className = "ef-chat__selection-cancel";
  cancel.textContent = labels.cancel;
  const actions = doc.createElement("div");
  actions.className = "ef-chat__selection-actions";
  actions.append(cancel, save);
  panel.append(trigger);
  let selected: ReturnType<typeof selectedChatText> = null;
  let editing = false;
  const close = () => { panel.remove(); editing = false; selected = null; input.value = ""; save.disabled = true; };
  const position = (rect: DOMRect) => {
    const width = panel.offsetWidth || (editing ? 320 : 84);
    const height = panel.offsetHeight || (editing ? 260 : 36);
    const left = editing ? rect.left : rect.left + (rect.width || 0) / 2 - width / 2;
    panel.style.left = `${Math.max(8, Math.min(left, doc.documentElement.clientWidth - width - 8))}px`;
    const below = rect.bottom + 8;
    panel.style.top = `${Math.max(8, below + height < doc.documentElement.clientHeight ? below : rect.top - height - 8)}px`;
  };
  const update = () => {
    if (editing) return;
    selected = selectedChatText(root);
    if (!selected) { close(); return; }
    panel.dataset.mode = "toolbar";
    panel.replaceChildren(trigger);
    inheritAnnotationTheme(root, panel);
    doc.body.append(panel);
    position(selected.rect);
  };
  trigger.onpointerdown = event => event.preventDefault();
  trigger.onclick = () => {
    if (!selected) return;
    editing = true;
    quote.textContent = selected.selectedText;
    panel.dataset.mode = "editor";
    panel.replaceChildren(quote, input, actions);
    position(selected.rect);
    input.focus();
  };
  input.oninput = () => { save.disabled = !input.value.trim(); };
  save.onclick = () => {
    if (!selected || !input.value.trim()) return;
    onAdd({ id: `a-${globalThis.crypto.randomUUID()}`, messageId: selected.messageId, selectedText: selected.selectedText, comment: input.value.trim() });
    doc.getSelection()?.removeAllRanges();
    close();
    root.closest(".ef-chat")?.querySelector<HTMLTextAreaElement>(".ef-chat__textarea")?.focus();
  };
  cancel.onclick = close;
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
  const outside = (event: PointerEvent) => { if (editing && !panel.contains(event.target as Node)) close(); };
  const scroll = () => { if (!editing) close(); };
  doc.addEventListener("selectionchange", update);
  doc.addEventListener("keydown", keydown);
  doc.addEventListener("pointerdown", outside);
  root.addEventListener("scroll", scroll, true);
  return () => {
    close();
    doc.removeEventListener("selectionchange", update);
    doc.removeEventListener("keydown", keydown);
    doc.removeEventListener("pointerdown", outside);
    root.removeEventListener("scroll", scroll, true);
  };
}

/** Portal previews outside transcript overflow, shared by hover and keyboard focus. */
export function mountChatAnnotationPreviews(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const tooltip = doc.createElement("div");
  tooltip.className = "ef-chat__annotation-tooltip";
  tooltip.id = `annotation-preview-${globalThis.crypto.randomUUID()}`;
  tooltip.setAttribute("role", "tooltip");
  let active: HTMLElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let highlighted: HTMLElement | null = null;
  let previousTabIndex: string | null = null;
  const clearHighlight = () => {
    clearTimeout(highlightTimer);
    if (highlighted) {
      highlighted.classList.remove("ef-chat__annotation-source-highlight");
      if (previousTabIndex === null) highlighted.removeAttribute("tabindex");
      else highlighted.setAttribute("tabindex", previousTabIndex);
    }
    highlighted = null;
  };
  const navigate = (event: Event) => {
    const trigger = (event.target as Element).closest<HTMLElement>("[data-annotation-source-id]");
    if (!trigger || !root.contains(trigger)) return;
    event.preventDefault();
    const source = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]"))
      .find(element => element.dataset.messageId === trigger.dataset.annotationSourceId);
    if (!source) return;
    hide();
    clearHighlight();
    highlighted = source;
    previousTabIndex = source.getAttribute("tabindex");
    source.classList.add("ef-chat__annotation-source-highlight");
    source.tabIndex = -1;
    source.focus({ preventScroll: true });
    const reduced = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    source.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "nearest" });
    highlightTimer = setTimeout(clearHighlight, 1800);
  };
  const navigateKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") navigate(event);
  };
  const hide = () => { clearTimeout(hideTimer); active?.removeAttribute("aria-describedby"); active = null; tooltip.remove(); };
  const show = (event: Event) => {
    clearTimeout(hideTimer);
    const target = (event.target as Element).closest<HTMLElement>("[data-annotation-tooltip]");
    if (!target || !root.contains(target)) return;
    if (active === target) return;
    hide();
    active = target;
    tooltip.textContent = target.dataset.annotationTooltip ?? "";
    target.setAttribute("aria-describedby", tooltip.id);
    inheritAnnotationTheme(target, tooltip);
    doc.body.append(tooltip);
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - tooltip.offsetWidth - 8))}px`;
    const below = rect.bottom + 8;
    tooltip.style.top = `${Math.max(8, below + tooltip.offsetHeight < doc.documentElement.clientHeight ? below : rect.top - tooltip.offsetHeight - 8)}px`;
  };
  const leave = (event: Event) => {
    const next = (event as MouseEvent).relatedTarget as Node | null;
    if (active?.contains(next) || tooltip.contains(next)) return;
    if (event.type === "focusout") { hide(); return; }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 120);
  };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
  root.addEventListener("click", navigate);
  root.addEventListener("keydown", navigateKey);
  root.addEventListener("mouseover", show);
  root.addEventListener("focusin", show);
  root.addEventListener("mouseout", leave);
  root.addEventListener("focusout", leave);
  root.addEventListener("scroll", hide, true);
  tooltip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  tooltip.addEventListener("mouseleave", hide);
  doc.addEventListener("keydown", escape);
  return () => {
    hide();
    clearHighlight();
    root.removeEventListener("click", navigate);
    root.removeEventListener("keydown", navigateKey);
    root.removeEventListener("mouseover", show);
    root.removeEventListener("focusin", show);
    root.removeEventListener("mouseout", leave);
    root.removeEventListener("focusout", leave);
    root.removeEventListener("scroll", hide, true);
    doc.removeEventListener("keydown", escape);
  };
}

/** Edit an unsent annotation without changing its identity or selected source. */
export function openChatAnnotationEditor(anchor: HTMLElement, annotation: ChatAnnotation, onSave: (annotation: ChatAnnotation) => void, labels: ChatAnnotationLabels = defaultChatAnnotationLabels): () => void {
  const doc = anchor.ownerDocument;
  const panel = doc.createElement("div");
  panel.className = "ef-chat__selection-comment";
  panel.dataset.mode = "editor";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", labels.comment);
  const quote = doc.createElement("blockquote");
  quote.textContent = annotation.selectedText;
  const input = doc.createElement("textarea");
  input.value = annotation.comment;
  input.placeholder = labels.commentPlaceholder;
  input.setAttribute("aria-label", labels.commentPlaceholder);
  const actions = doc.createElement("div");
  actions.className = "ef-chat__selection-actions";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.className = "ef-chat__selection-cancel";
  cancel.textContent = labels.cancel;
  const save = doc.createElement("button");
  save.type = "button";
  save.className = "ef-chat__selection-save";
  save.textContent = labels.saveChanges ?? labels.addToMessage;
  actions.append(cancel, save);
  panel.append(quote, input, actions);
  inheritAnnotationTheme(anchor, panel);
  doc.body.append(panel);
  const rect = anchor.getBoundingClientRect();
  const width = panel.offsetWidth || 320;
  const height = panel.offsetHeight || 220;
  panel.style.left = `${Math.max(8, Math.min(rect.left, doc.documentElement.clientWidth - width - 8))}px`;
  panel.style.top = `${Math.max(8, rect.bottom + height + 8 < doc.documentElement.clientHeight ? rect.bottom + 8 : rect.top - height - 8)}px`;
  const dispose = () => {
    panel.remove();
    doc.removeEventListener("keydown", keydown);
    doc.removeEventListener("pointerdown", outside);
  };
  const dismiss = () => { dispose(); if (anchor.isConnected) anchor.focus(); };
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
  const outside = (event: PointerEvent) => { if (!panel.contains(event.target as Node)) dispose(); };
  cancel.onclick = dismiss;
  input.oninput = () => { save.disabled = !input.value.trim(); };
  save.onclick = () => {
    if (!input.value.trim()) return;
    onSave({ ...annotation, comment: input.value.trim() });
    dismiss();
  };
  doc.addEventListener("keydown", keydown);
  doc.addEventListener("pointerdown", outside);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return dispose;
}
