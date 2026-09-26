// @vitest-environment jsdom

import type { IDisposable, Terminal as XTerminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentPromptAddon } from "./agentPrompt";

class TerminalStub {
  readonly cols = 80;
  readonly buffer = { active: { cursorX: 0 } };
  readonly element = document.createElement("div");
  readonly options: XTerminal["options"] = { cursorInactiveStyle: "outline" };
  readonly textarea = document.createElement("textarea");
  readonly blur = vi.fn(() => this.textarea.blur());
  readonly focus = vi.fn(() => this.textarea.focus());
  readonly write = vi.fn();
  private writeParsedHandler?: () => void;
  private dataHandler?: (data: string) => void;

  constructor() {
    this.element.appendChild(this.textarea);
    document.body.appendChild(this.element);
  }

  onCursorMove = listenerStub;
  onWriteParsed = (handler: () => void): IDisposable => {
    this.writeParsedHandler = handler;
    return { dispose: vi.fn() };
  };
  onResize = listenerStub;
  onData = (handler: (data: string) => void): IDisposable => {
    this.dataHandler = handler;
    return { dispose: vi.fn() };
  };

  emitWriteParsed() {
    this.writeParsedHandler?.();
  }

  emitData(data: string) {
    this.dataHandler?.(data);
  }

  registerMarker() {
    return { dispose: vi.fn() };
  }

  registerDecoration() {
    return undefined;
  }
}

function listenerStub(): IDisposable {
  return { dispose: vi.fn() };
}

describe("AgentPromptAddon cursor visibility", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("keeps the cursor hidden across terminal redraws and restores focus", () => {
    const terminal = new TerminalStub();
    const addon = new AgentPromptAddon({ text: "Ask AI" });
    addon.activate(terminal as unknown as XTerminal);
    terminal.textarea.focus();

    addon.setInputState(false, "", { hideCursor: true });

    expect(terminal.options.cursorInactiveStyle).toBe("none");
    expect(terminal.write).toHaveBeenCalledWith("\x1b[?25l");
    expect(terminal.blur).toHaveBeenCalledOnce();
    expect(
      terminal.element.classList.contains("ai-terminal-input-disabled"),
    ).toBe(true);

    terminal.emitWriteParsed();
    terminal.textarea.focus();

    expect(terminal.blur).toHaveBeenCalledTimes(2);
    expect(terminal.options.cursorInactiveStyle).toBe("none");

    addon.setInputState(false, "", { hideCursor: false });

    expect(terminal.options.cursorInactiveStyle).toBe("outline");
    expect(terminal.write).toHaveBeenLastCalledWith("\x1b[?25h");
    expect(terminal.focus).toHaveBeenCalledOnce();
    expect(
      terminal.element.classList.contains("ai-terminal-input-disabled"),
    ).toBe(false);
    addon.dispose();
  });

  it("does not focus a terminal that was inactive before the request", () => {
    const terminal = new TerminalStub();
    const addon = new AgentPromptAddon({ text: "Ask AI" });
    addon.activate(terminal as unknown as XTerminal);

    addon.setInputState(false, "", { hideCursor: true });
    addon.setInputState(false, "", { hideCursor: false });

    expect(terminal.focus).not.toHaveBeenCalled();
    addon.dispose();
  });

  it.each(["abc", "中文"])(
    "keeps the prompt visible after deleting input before shell echo catches up (%s)",
    (input) => {
      const terminal = new TerminalStub();
      const addon = new AgentPromptAddon({ text: "Ask AI" });
      const setVisible = vi.spyOn(
        addon as unknown as { setVisible: (visible: boolean) => void },
        "setVisible",
      );
      addon.activate(terminal as unknown as XTerminal);
      addon.setInputState(true, "");

      for (const character of Array.from(input)) {
        terminal.emitData(character);
      }
      expect(setVisible).toHaveBeenLastCalledWith(false);
      addon.setInputState(true, input);
      for (let index = 0; index < Array.from(input).length; index += 1) {
        terminal.emitData("\u007f");
      }
      addon.setInputState(true, input);

      expect(setVisible).toHaveBeenLastCalledWith(true);
      addon.setInputState(true, "");
      expect(setVisible).toHaveBeenLastCalledWith(true);
      addon.dispose();
    },
  );

  it("keeps the prompt hidden while a model session is active", () => {
    const terminal = new TerminalStub();
    const addon = new AgentPromptAddon({ text: "Ask AI" });
    const setVisible = vi.spyOn(
      addon as unknown as { setVisible: (visible: boolean) => void },
      "setVisible",
    );
    addon.activate(terminal as unknown as XTerminal);
    addon.setInputState(true, "");
    addon.setModelSessionActive(true);
    setVisible.mockClear();

    addon.setModelSessionActive(true);

    expect(setVisible).toHaveBeenLastCalledWith(false);
    addon.dispose();
  });
});
