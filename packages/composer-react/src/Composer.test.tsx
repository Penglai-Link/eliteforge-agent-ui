// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Composer, type ComposerReactProps } from "./Composer";
afterEach(cleanup);
function Controlled(props: Partial<ComposerReactProps>) {
  const [draft, setDraft] = useState(props.draft ?? "");
  return (
    <Composer
      onSend={() => {}}
      {...props}
      draft={draft}
      onDraftChange={setDraft}
    />
  );
}
it("supports independent send, queue, steer, stop and disabled gates without chat", () => {
  const send = vi.fn(),
    stop = vi.fn();
  const { rerender } = render(
    <Composer draft="message" onDraftChange={() => {}} onSend={send} />
  );
  const editor = screen.getByRole("textbox");
  fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(send).toHaveBeenLastCalledWith("send");
  rerender(
    <Composer
      draft="message"
      onDraftChange={() => {}}
      onSend={send}
      onStop={stop}
      sending
      runningSubmitModes={["queue", "steer"]}
    />
  );
  fireEvent.keyDown(editor, { key: "Enter" });
  expect(send).toHaveBeenLastCalledWith("queue");
  fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
  expect(send).toHaveBeenLastCalledWith("steer");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(stop).toHaveBeenCalledOnce();
  send.mockClear();
  rerender(
    <Composer
      draft="message"
      onDraftChange={() => {}}
      onSend={send}
      sending
      runningSubmitModes={["queue", "steer"]}
      queueDisabled
      steerDisabled
    />
  );
  fireEvent.keyDown(editor, { key: "Enter" });
  fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
  expect(send).not.toHaveBeenCalled();
});
it("routes running shortcuts according to the configured Enter action", () => {
  const send = vi.fn();
  const { rerender } = render(<Composer draft="message" onDraftChange={() => {}} onSend={send}
    sending runningSubmitModes={["queue", "steer"]} runningEnterSubmitMode="steer" />);
  const editor = screen.getByRole("textbox");
  fireEvent.keyDown(editor, { key: "Enter" });
  fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
  expect(send.mock.calls).toEqual([["steer"], ["queue"]]);
  rerender(<Composer draft="message" onDraftChange={() => {}} onSend={send}
    sending runningSubmitModes={["queue", "steer"]} runningEnterSubmitMode="queue" />);
  send.mockClear();
  fireEvent.keyDown(editor, { key: "Enter" });
  fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
  expect(send.mock.calls).toEqual([["queue"], ["steer"]]);
});
it("selects skill suggestions, displays their label, dismisses menus and inserts newlines", async () => {
  render(
    <Controlled
      draft="$"
      inputSuggestions={[
        { kind: "skill", name: "review", displayName: "代码审查" },
      ]}
    />
  );
  const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(editor.value).toBe("$review "));
  expect(
    document.querySelector(".ef-chat__skill-token-label")?.textContent
  ).toBe("代码审查");
  fireEvent.change(editor, { target: { value: "$" } });
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.change(editor, { target: { value: "ab" } });
  editor.setSelectionRange(1, 1);
  fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
  expect(editor.value).toBe("a\nb");
});
it("uses the native editor for long text and while selecting skill text", () => {
  const longText = "A long line that wraps in the composer. ".repeat(20);
  const { rerender } = render(<Composer draft={longText} onDraftChange={() => {}} onSend={() => {}} />);
  const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
  const wrapper = editor.closest(".ef-chat__composer-editor")!;
  expect(wrapper.getAttribute("data-has-tokens")).toBeNull();
  rerender(<Composer draft="$review selected text" inputSuggestions={[{ kind: "skill", name: "review" }]} onDraftChange={() => {}} onSend={() => {}} />);
  expect(wrapper.getAttribute("data-has-tokens")).toBe("true");
  editor.setSelectionRange(0, 7);
  fireEvent.select(editor);
  expect(wrapper.getAttribute("data-has-tokens")).toBeNull();
});
it("retains header/addon, queue edits/removal, attachment preview/removal, paste and file upload", () => {
  const edit = vi.fn(),
    remove = vi.fn(),
    removeAttachment = vi.fn(),
    upload = vi.fn(),
    paste = vi.fn();
  render(
    <Controlled
      composerHeader={<span>Model picker</span>}
      footerAddon={<span>Extra controls</span>}
      queuedMessages={[{ id: "q", input: { content: "Queued request" } }]}
      onEditQueuedMessage={edit}
      onRemoveQueuedMessage={remove}
      pendingAttachments={[
        {
          id: "f",
          kind: "file",
          fileName: "spec.md",
          metadata: {},
          summary: "Spec",
        },
        {
          id: "i",
          kind: "image",
          imageUrl: "data:image/png;base64,AA==",
          summary: "Preview",
          metadata: {},
        },
      ]}
      onRemoveAttachment={removeAttachment}
      showAttachmentControl
      onAttachFile={upload}
      onPasteAttachment={paste}
    />
  );
  expect(screen.getByText("Model picker")).toBeTruthy();
  expect(screen.getByText("Extra controls")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Preview" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit queued message" }));
  expect(edit).toHaveBeenCalledWith("q", "Queued request");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove queued message" })
  );
  expect(remove).toHaveBeenCalledWith("q");
  fireEvent.click(screen.getByRole("button", { name: "Remove spec.md" }));
  expect(removeAttachment).toHaveBeenCalledWith("f");
  const file = new File(["image"], "image.png", { type: "image/png" });
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  expect(upload).toHaveBeenCalledWith(file);
  fireEvent.paste(screen.getByRole("textbox"), {
    clipboardData: {
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    },
  });
  expect(paste).toHaveBeenCalledWith(file);
});
it("sends queue reorder only after a user drop", () => {
  const reorder = vi.fn();
  render(<Composer draft="" onDraftChange={() => {}} onSend={() => {}}
    queuedMessages={[{ id: "first", input: { content: "First" } }, { id: "second", input: { content: "Second" } }]}
    onReorderQueuedMessage={reorder} />);
  const rows = document.querySelectorAll(".ef-chat__queued-message");
  const dataTransfer = { effectAllowed: "none", setData: vi.fn() };
  fireEvent.dragStart(rows[1], { dataTransfer });
  fireEvent.dragOver(rows[0]);
  expect(reorder).not.toHaveBeenCalled();
  fireEvent.drop(rows[0]);
  expect(reorder).toHaveBeenCalledWith("second", "first");
});
