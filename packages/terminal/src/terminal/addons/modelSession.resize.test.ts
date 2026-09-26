// @vitest-environment jsdom

import type { IDisposable, Terminal as XTerminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModelSessionAddon } from "./modelSession";

let animationFrames: FrameRequestCallback[];

function resizeEntry(target: HTMLElement, width: number) {
  return { contentRect: { width }, target } as unknown as ResizeObserverEntry;
}

class TerminalStub {
  readonly buffer = {
    active: {
      type: "normal" as "normal" | "alternate",
      baseY: 0,
      cursorX: 0,
      cursorY: 0,
      viewportY: 0,
    },
  };
  readonly element = document.createElement("div");
  readonly markers: Array<{ dispose: ReturnType<typeof vi.fn>; line: number }> = [];
  readonly clearScreenDisposable = { dispose: vi.fn() };
  private clearScreenHandler?: (
    params: (number | number[])[],
  ) => boolean | Promise<boolean>;
  private resizeHandler?: () => void;

  readonly parser = {
    registerCsiHandler: vi.fn(
      (
        _id: unknown,
        handler: (params: (number | number[])[]) => boolean | Promise<boolean>,
      ) => {
        this.clearScreenHandler = handler;
        return this.clearScreenDisposable;
      },
    ),
  };

  onScroll(): IDisposable {
    return { dispose: vi.fn() };
  }

  onResize(handler: () => void): IDisposable {
    this.resizeHandler = handler;
    return { dispose: vi.fn() };
  }

  registerMarker(cursorYOffset = 0) {
    const marker = { dispose: vi.fn(), line: cursorYOffset };
    this.markers.push(marker);
    return marker;
  }

  emitResize() {
    this.resizeHandler?.();
  }

  emitEraseInDisplay(params: (number | number[])[] = []) {
    return this.clearScreenHandler?.(params);
  }

  write = vi.fn((_data: string, callback?: () => void) => callback?.());
}

describe("ModelSessionAddon card resize tracking", () => {
  let observerCallback: ResizeObserverCallback;
  const observe = vi.fn();

  beforeEach(() => {
    observe.mockClear();
    animationFrames = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observerCallback = callback;
        }

        observe = observe;
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes the display when any observed card changes width", () => {
    const onLayoutResize = vi.fn();
    const addon = new ModelSessionAddon({ onLayoutResize });
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);

    addon.appendMessageChunk({ conversationId: "one", requestId: "one", response: "one" });
    addon.appendMessageChunk({ conversationId: "two", requestId: "two", response: "two" });

    const cards = [...terminal.element.querySelectorAll<HTMLElement>(".ai-terminal-model-session-host")];
    expect(observe).toHaveBeenCalledTimes(2);

    observerCallback([resizeEntry(cards[0], 420)], {} as ResizeObserver);
    observerCallback([resizeEntry(cards[1], 640)], {} as ResizeObserver);

    expect(onLayoutResize).toHaveBeenCalledTimes(2);
    addon.dispose();
  });

  it("ignores detail toggles while the session is running", () => {
    const onLayoutResize = vi.fn();
    const addon = new ModelSessionAddon({ onLayoutResize });
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({ conversationId: "one", requestId: "one", response: "one" });

    const host = terminal.element.querySelector<HTMLElement>(".ai-terminal-model-session-host");
    const detail = document.createElement("details");
    host?.appendChild(detail);
    detail.dispatchEvent(new Event("toggle"));

    expect(onLayoutResize).not.toHaveBeenCalled();
    addon.dispose();
  });

  it("anchors a streaming card only after the command output has finished", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });

    expect(terminal.markers).toHaveLength(0);

    addon.anchorPendingSessions();
    expect(terminal.markers).toHaveLength(1);
    addon.dispose();
  });

  it("shows a prepared session immediately below the submitted natural-language line", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);

    addon.prepareNextSessionAnchor();
    addon.startSession({ conversationId: "one", requestId: "one" });
    flushAnimationFrames();

    const host = terminal.element.querySelector<HTMLElement>(
      ".ai-terminal-model-session-host",
    );
    expect(host?.hidden).toBe(false);
    expect(terminal.markers).toHaveLength(1);
    expect(terminal.markers[0].line).toBe(1);
    expect(terminal.write).toHaveBeenCalledWith("\r\n", expect.any(Function));
    addon.dispose();
  });

  it("renders user input in a terminal-level host separate from the session card", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.startSession({ conversationId: "one", requestId: "one" });
    addon.appendUserInputRequest({
      conversationId: "one",
      requestId: "one",
      response: "",
      request: {
        requestId: "INPUT-1",
        intro: "Please choose an option",
        questions: [{
          questionId: "Q-1",
          question: "What should I do next?",
          options: [{ optionId: "ONE", label: "Option one" }],
        }],
      },
    });

    const sessionHost = terminal.element.querySelector<HTMLElement>(
      ".ai-terminal-model-session-host",
    );
    const inputHost = terminal.element.querySelector<HTMLElement>(
      ".ai-terminal-model-session-user-input-host",
    );
    expect(sessionHost?.parentElement).toBe(terminal.element);
    expect(inputHost?.parentElement).toBe(terminal.element);
    expect(sessionHost?.querySelector(".ai-terminal-model-session__user-input")).toBeNull();
    expect(sessionHost?.textContent).toContain("Please choose an option");
    expect(inputHost?.hidden).toBe(false);
    expect(inputHost?.querySelector(".ai-terminal-model-session__user-input-intro")).toBeNull();
    expect(inputHost?.querySelector(".ai-terminal-model-session__user-input")).not.toBeNull();
    addon.dispose();
  });

  it("reserves additional terminal rows as a streaming card grows", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });
    addon.anchorPendingSessions();
    flushAnimationFrames();

    const host = terminal.element.querySelector<HTMLElement>(
      ".ai-terminal-model-session-host",
    );
    const card = host?.firstElementChild as HTMLElement;
    Object.defineProperty(card, "scrollHeight", { configurable: true, value: 72 });

    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: " more",
    });
    flushAnimationFrames();

    expect(terminal.markers).toHaveLength(1);
    expect(terminal.write).toHaveBeenLastCalledWith(
      "\r\n".repeat(3),
      expect.any(Function),
    );
    addon.dispose();
  });

  it("does not complete until every reserved terminal row has been written", async () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    let releaseWrite: (() => void) | undefined;
    terminal.write.mockImplementation((_data, callback) => {
      releaseWrite = callback;
    });
    addon.activate(terminal as unknown as XTerminal);
    addon.prepareNextSessionAnchor();
    addon.startSession({ conversationId: "one", requestId: "one" });
    flushAnimationFrames();

    let completed = false;
    const completion = addon.complete("one").then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    releaseWrite?.();
    await completion;
    expect(completed).toBe(true);
    addon.dispose();
  });

  it("repositions a card from its reflowed marker line after terminal resize", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });
    addon.anchorPendingSessions();
    flushAnimationFrames();

    terminal.markers[0].line = 4;
    terminal.emitResize();
    flushAnimationFrames();

    const host = terminal.element.querySelector<HTMLElement>(
      ".ai-terminal-model-session-host",
    );
    expect(host?.style.transform).toBe("translate3d(0, 72px, 0)");

    terminal.markers[0].line = 6;
    terminal.emitResize();
    flushAnimationFrames();
    expect(host?.style.transform).toBe("translate3d(0, 108px, 0)");

    addon.dispose();
    expect(terminal.markers[0].dispose).toHaveBeenCalledOnce();
  });
});

describe("ModelSessionAddon terminal clear synchronization", () => {
  beforeEach(() => {
    animationFrames = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes model cards for full-display erase sequences", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    expect(terminal.parser.registerCsiHandler).toHaveBeenCalledWith(
      { final: "J" },
      expect.any(Function),
    );
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });

    const host = terminal.element.querySelector(
      ".ai-terminal-model-session-host",
    );
    expect(host).not.toBeNull();
    expect(terminal.emitEraseInDisplay([2])).toBe(false);
    expect(terminal.element.contains(host)).toBe(false);
    addon.dispose();
  });

  it("recognizes a default erase after the cursor moved to the top-left", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });

    const host = terminal.element.querySelector(
      ".ai-terminal-model-session-host",
    );
    expect(terminal.emitEraseInDisplay([])).toBe(false);
    expect(terminal.element.contains(host)).toBe(false);
    addon.dispose();
  });

  it("ignores partial and alternate-buffer erases", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);
    addon.appendMessageChunk({
      conversationId: "one",
      requestId: "one",
      response: "one",
    });

    const host = terminal.element.querySelector(
      ".ai-terminal-model-session-host",
    );
    terminal.buffer.active.cursorX = 4;
    expect(terminal.emitEraseInDisplay([0])).toBe(false);
    expect(terminal.element.contains(host)).toBe(true);

    terminal.buffer.active.type = "alternate";
    expect(terminal.emitEraseInDisplay([2])).toBe(false);
    expect(terminal.element.contains(host)).toBe(true);
    addon.dispose();
  });

  it("disposes the clear-sequence listener", () => {
    const addon = new ModelSessionAddon();
    const terminal = new TerminalStub();
    addon.activate(terminal as unknown as XTerminal);

    addon.dispose();

    expect(terminal.clearScreenDisposable.dispose).toHaveBeenCalledOnce();
  });
});

function flushAnimationFrames() {
  while (animationFrames.length > 0) {
    animationFrames.shift()?.(performance.now());
  }
}
