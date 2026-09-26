// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => null,
});
Object.defineProperty(window, "matchMedia", {
  value: () => ({
    addEventListener() {},
    addListener() {},
    matches: false,
    removeEventListener() {},
    removeListener() {},
  }),
});

function dispatchKey(target: EventTarget, key: string, keyCode: number, code = "") {
  const event = new KeyboardEvent("keydown", { bubbles: true, code, key });
  Object.defineProperties(event, {
    keyCode: { value: keyCode },
    which: { value: keyCode },
  });
  target.dispatchEvent(event);
}

function dispatchInsertText(target: EventTarget, data: string) {
  const event = new InputEvent("input", { bubbles: true, data, inputType: "insertText" });
  Object.defineProperties(event, {
    composed: { value: true },
    inputType: { value: "insertText" },
  });
  target.dispatchEvent(event);
}

function dispatchComposition(target: EventTarget, type: string, data = "") {
  target.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
}

describe("xterm Apple Pinyin keyCode=229 patch", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("forwards committed Chinese and following ASCII exactly once", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    // Apple Pinyin can commit text before its synthetic keyCode=229 keydown.
    dispatchInsertText(textarea!, "中");
    dispatchKey(textarea!, "Process", 229);
    dispatchInsertText(textarea!, "文");
    dispatchKey(textarea!, "Process", 229);

    // Switching to ABC must not be replayed by the old delayed textarea diff.
    dispatchKey(textarea!, "a", 65);
    dispatchKey(textarea!, "b", 66);
    dispatchKey(textarea!, "c", 67);
    dispatchInsertText(textarea!, " ");
    dispatchKey(textarea!, "Process", 229);
    dispatchKey(textarea!, "Backspace", 8);

    expect(output.join("")).toBe("中文abc \x7f");
    terminal.dispose();
  });

  it("does not let a keyCode=229 textarea diff replay the next input", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    // Apple Pinyin/Doubao can report keyCode=229 after every insertText.
    // The legacy delayed textarea diff re-emits the following key on rollover.
    setTextareaValue(textarea!, "j");
    dispatchInsertText(textarea!, "j");
    dispatchKey(textarea!, "j", 229);
    setTextareaValue(textarea!, "jk");
    dispatchInsertText(textarea!, "k");
    dispatchKey(textarea!, "k", 229);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(output.join("")).toBe("jk");
    terminal.dispose();
  });

  it("falls back to the composition-end snapshot when the browser omits a final InputEvent", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    dispatchComposition(textarea!, "compositionstart");
    setTextareaValue(textarea!, "你好");
    dispatchComposition(textarea!, "compositionupdate", "你好");
    dispatchKey(textarea!, "Process", 229);
    dispatchComposition(textarea!, "compositionend", "你好");

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(output.join("")).toBe("你好");
    terminal.dispose();
  });

  it("prefers a delayed final input over a spaced Apple Pinyin preedit", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    dispatchComposition(textarea!, "compositionstart");
    setTextareaValue(textarea!, "a s d f");
    dispatchComposition(textarea!, "compositionupdate", "a s d f");
    dispatchKey(textarea!, "Process", 229);
    dispatchComposition(textarea!, "compositionend", "a s d f");

    // Chromium can deliver the authoritative InputEvent after compositionend.
    // Its data wins over the spaced text used to render the former preedit.
    await new Promise((resolve) => setTimeout(resolve, 10));
    setTextareaValue(textarea!, "asdf");
    dispatchInsertText(textarea!, "asdf");
    dispatchKey(textarea!, "Process", 229);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(output.join("")).toBe("asdf");
    terminal.dispose();
  });

  it("drops the active Apple Pinyin preedit when Caps Lock switches to ABC", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    dispatchComposition(textarea!, "compositionstart");
    setTextareaValue(textarea!, "a s d f");
    dispatchComposition(textarea!, "compositionupdate", "a s d f");

    // macOS delivers this before the source change's compositionend event.
    // Some Chromium IME paths report Process (229) for this physical key.
    dispatchKey(textarea!, "CapsLock", 229, "CapsLock");
    dispatchComposition(textarea!, "compositionend", "a s d f");
    await new Promise((resolve) => setTimeout(resolve, 60));

    // The first ABC input must be the only data sent to the PTY.
    setTextareaValue(textarea!, "asdf");
    dispatchInsertText(textarea!, "asdf");
    expect(output.join("")).toBe("asdf");
    terminal.dispose();
  });

  it("does not strand the first ABC input when Chromium omits compositionend", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    dispatchComposition(textarea!, "compositionstart");
    setTextareaValue(textarea!, "a s d f");
    dispatchComposition(textarea!, "compositionupdate", "a s d f");
    dispatchKey(textarea!, "CapsLock", 20, "CapsLock");

    // The cancellation flag must not block the first ABC input.
    setTextareaValue(textarea!, "a");
    dispatchInsertText(textarea!, "a");

    expect(output.join("")).toBe("a");
    terminal.dispose();
  });

  it("forwards a confirmed Chinese composition before immediate following ASCII", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const terminal = new Terminal();
    const output: string[] = [];
    terminal.onData((data) => output.push(data));
    const host = document.createElement("div");
    document.body.appendChild(host);
    terminal.open(host);

    const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    dispatchComposition(textarea!, "compositionstart");
    setTextareaValue(textarea!, "ni hao");
    dispatchComposition(textarea!, "compositionupdate", "ni hao");
    dispatchComposition(textarea!, "compositionend", "你好");

    // This is a new ASCII key, not the IME's final InputEvent. The committed
    // Chinese must be flushed ahead of it instead of being discarded.
    setTextareaValue(textarea!, "a");
    dispatchInsertText(textarea!, "a");

    expect(output.join("")).toBe("你好a");
    terminal.dispose();
  });
});
