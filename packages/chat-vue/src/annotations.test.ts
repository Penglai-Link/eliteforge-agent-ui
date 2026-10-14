// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import { type ChatMessage, type ChatSession } from "@eliteforge/agent-ui-chat-core";
import ChatPanel from "./components/ChatPanel.vue";
it("restores annotation history and previews a reply citation with keyboard focus", async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const annotation = {id: "a-1", messageId: "source", selectedText: "Original text", comment: "Explain the check"};
  const encoded = "Please explain";
  const messages = [{messageId: "user", role: "USER", content: encoded, annotations: [annotation]}, {messageId: "assistant", role: "ASSISTANT", content: "[Annotation 1](#chat-annotation-a-1) Here is why."}].map(item => ({...item, actor: item.role, createdAt: new Date().toISOString(), sessionId: "test", channel: "conversation", id: item.messageId})) as ChatMessage[];
  messages.unshift({...messages[1], messageId: "source", id: "source", content: "Original text"});
  const root = document.createElement("div"); document.body.append(root);
  const draft = ref(encoded);
  const pendingAnnotations = ref([annotation]);
  const app = createApp({render: () => h(ChatPanel, {messages, draft: draft.value, pendingAnnotations: pendingAnnotations.value, onPendingAnnotationsChange: value => pendingAnnotations.value = value, onDraftChange: value => draft.value = value, onSend: vi.fn(), session: {sessionId: "test", status: "ACTIVE"} as ChatSession})});
  app.mount(root); await nextTick(); await nextTick();
  try {
    expect(root.textContent).toContain("1 annotation");
    expect(root.textContent).not.toContain("eliteforge-chat-annotations:v1");
    const link = root.querySelector('a[href="#chat-annotation-a-1"]')!;
    link.dispatchEvent(new FocusEvent('focusin', {bubbles: true}));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Original text");
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Explain the check");
    const source = root.querySelector('[data-message-id="source"]') as HTMLElement;
    source.scrollIntoView = vi.fn();
    (link as HTMLAnchorElement).click();
    expect(source.scrollIntoView).toHaveBeenCalled();
    expect(source.classList.contains('ef-chat__annotation-source-highlight')).toBe(true);
    (root.querySelector('.ef-chat__pending-annotation-edit') as HTMLButtonElement).click();
    const editor = document.querySelector('.ef-chat__selection-comment')!;
    const editInput = editor.querySelector('textarea')!;
    expect(editInput.value).toBe('Explain the check');
    editInput.value = 'Updated before sending';
    editInput.dispatchEvent(new Event('input'));
    (editor.querySelector('.ef-chat__selection-save') as HTMLButtonElement).click();
    await nextTick();
    expect(pendingAnnotations.value).toEqual([{...annotation, comment: 'Updated before sending'}]);
    expect(root.textContent).toContain('Updated before sending');
    const remove = root.querySelector('[aria-label="Remove Annotation 1"]') as HTMLButtonElement;
    remove.click(); await nextTick();
    expect(draft.value).toBe("Please explain");
  } finally { app.unmount(); root.remove(); }
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});
