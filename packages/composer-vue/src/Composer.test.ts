// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it, vi } from "vitest";
import Composer from "./Composer.vue";
it("works independently with suggestions, IME, multiline input, send/queue/steer/stop and queue controls", async () => {
  const draft = ref("$"),
    sending = ref(false),
    blocked = ref(false),
    enterMode = ref<"queue" | "steer">("queue"),
    send = vi.fn(),
    stop = vi.fn(),
    edit = vi.fn(),
    remove = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp({
    render: () =>
      h(
        Composer,
        {
          draft: draft.value,
          onDraftChange: (value: string) => {
            draft.value = value;
          },
          onSend: send,
          onStop: stop,
          sending: sending.value,
          runningSubmitModes: ["queue", "steer"],
          runningEnterSubmitMode: enterMode.value,
          queueDisabled: blocked.value,
          steerDisabled: blocked.value,
          inputSuggestions: [
            { kind: "skill", name: "review", displayName: "代码审查" },
          ],
          queuedMessages: [{ id: "q", input: { content: "Queued request" } }],
          onEditQueuedMessage: edit,
          onRemoveQueuedMessage: remove,
        },
        {
          composerHeader: () => "Model picker",
          footerAddon: () => "Extra controls",
        }
      ),
  });
  try {
    app.mount(container);
    const editor = container.querySelector("textarea")!;
    const key = async (options: KeyboardEventInit) => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...options,
        })
      );
      await nextTick();
    };
    await key({ key: "Enter" });
    expect(draft.value).toBe("$review ");
    expect(
      container.querySelector(".ef-chat__skill-token-label")?.textContent
    ).toBe("代码审查");
    draft.value = "ab";
    await nextTick();
    editor.setSelectionRange(1, 1);
    await key({ key: "Enter", shiftKey: true });
    expect(draft.value).toBe("a\nb");
    await key({ key: "Enter", isComposing: true });
    expect(send).not.toHaveBeenCalled();
    await key({ key: "Enter" });
    expect(send).toHaveBeenLastCalledWith("send");
    sending.value = true;
    await nextTick();
    await key({ key: "Enter" });
    expect(send).toHaveBeenLastCalledWith("queue");
    await key({ key: "Enter", metaKey: true });
    expect(send).toHaveBeenLastCalledWith("steer");
    enterMode.value = "steer";
    await nextTick();
    send.mockClear();
    await key({ key: "Enter" });
    await key({ key: "Enter", ctrlKey: true });
    expect(send.mock.calls).toEqual([["steer"], ["queue"]]);
    (
      container.querySelector('[aria-label="Stop"]') as HTMLButtonElement
    ).click();
    expect(stop).toHaveBeenCalledOnce();
    blocked.value = true;
    await nextTick();
    send.mockClear();
    await key({ key: "Enter" });
    await key({ key: "Enter", ctrlKey: true });
    expect(send).not.toHaveBeenCalled();
    (
      container.querySelector(
        '[aria-label="Edit queued message"]'
      ) as HTMLButtonElement
    ).click();
    expect(edit).toHaveBeenCalledWith("q", "Queued request");
    (
      container.querySelector(
        '[aria-label="Remove queued message"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove).toHaveBeenCalledWith("q");
    expect(container.textContent).toContain("Model picker");
    expect(container.textContent).toContain("Extra controls");
  } finally {
    app.unmount();
    container.remove();
  }
});
it("supports attachment upload, paste and removal and releases downloaded image URLs", async () => {
  const upload = vi.fn(),
    paste = vi.fn(),
    remove = vi.fn(),
    revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:preview",
    revokeObjectURL: revoke,
  });
  const container = document.createElement("div");
  const app = createApp({
    render: () =>
      h(Composer, {
        draft: "",
        showAttachmentControl: true,
        onAttachFile: upload,
        onPasteAttachment: paste,
        onRemoveAttachment: remove,
        attachmentDownloader: async () => new Blob(["image"]),
        pendingAttachments: [
          { id: "i", kind: "image", summary: "Photo", metadata: {} },
        ],
      }),
  });
  try {
    app.mount(container);
    await nextTick();
    await nextTick();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:preview"
    );
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(upload).toHaveBeenCalledWith(file);
    const event = new Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      },
    });
    container.querySelector("textarea")!.dispatchEvent(event);
    expect(paste).toHaveBeenCalledWith(file);
    (
      container.querySelector(
        '[aria-label="Remove Photo"]'
      ) as HTMLButtonElement
    ).click();
    expect(remove).toHaveBeenCalledWith("i");
  } finally {
    app.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview");
    vi.unstubAllGlobals();
  }
});
