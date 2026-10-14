// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { chatAnnotationsByMessage, selectedChatText, mountChatAnnotationSelection } from "./annotations";
import type { ChatMessage } from "./types";
const annotation = { id: "a-1", messageId: "source", selectedText: 'A "quote"\n<script>hello</script> <!-- eliteforge-chat-annotations:v1 -->', comment: "Why?" };
const message = (role: ChatMessage['role'], content: string, messageId: string) => ({ role, content, messageId }) as ChatMessage;
describe("conversation annotations", () => {
  it("round trips annotation metadata separately from the untouched body", () => {
    const original = {...message("USER", "Explain", "user"), annotations: [annotation]};
    const restored = JSON.parse(JSON.stringify(original));
    expect(restored.content).toBe("Explain");
    expect(restored.annotations).toEqual([annotation]);
  });
  it("keeps references within their user turn across multiple assistant messages", () => {
    const messages = [{...message("USER", "", "user"), annotations: [annotation]}, message("ASSISTANT", "part", "part"), message("ASSISTANT", "final", "final"), message("USER", "next", "next"), message("ASSISTANT", "Annotation 1", "later")];
    const map = chatAnnotationsByMessage(messages);
    expect(map.get("final")).toEqual([annotation]);
    expect(map.get("later")).toEqual([]);
  });
  it("accepts only selection inside one completed message and cleans up the popover", () => {
    const root = document.createElement("div");
    root.innerHTML = '<article data-message-id="source"><div data-chat-annotation-source>First text</div><button>Copy</button></article><article data-message-id="second"><div data-chat-annotation-source>Second text</div></article>';
    document.body.append(root);
    const bodies = root.querySelectorAll('[data-chat-annotation-source]');
    const range = document.createRange();
    Object.defineProperty(range, 'getBoundingClientRect', {value: () => ({left: 20, bottom: 40})});
    range.selectNodeContents(bodies[0]);
    const selection = document.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    expect(selectedChatText(root)?.selectedText).toBe("First text");
    const add = vi.fn(); const dispose = mountChatAnnotationSelection(root, add);
    document.dispatchEvent(new Event('selectionchange'));
    (document.querySelector('.ef-chat__selection-comment button') as HTMLButtonElement).click();
    const input = document.querySelector('.ef-chat__selection-comment textarea') as HTMLTextAreaElement;
    input.value = "Explain this"; input.dispatchEvent(new Event('input'));
    (document.querySelector('.ef-chat__selection-save') as HTMLButtonElement).click();
    expect(add.mock.calls[0][0]).toMatchObject({messageId: 'source', selectedText: 'First text', comment: 'Explain this'});
    range.setStart(bodies[0].firstChild!, 0); range.setEnd(bodies[1].firstChild!, 3);
    selection.addRange(range);
    expect(selectedChatText(root)).toBeNull();
    dispose(); root.remove(); selection.removeAllRanges();
    expect(document.querySelector('.ef-chat__selection-comment')).toBeNull();
  });
});
