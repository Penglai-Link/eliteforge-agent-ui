// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fit = vi.fn();
const refresh = vi.fn();
const disposeBufferChange = vi.fn();
let bufferChange: ((buffer: { type: "normal" | "alternate" }) => void) | undefined;

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = fit;
  },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    element?: HTMLElement;
    options = {};
    buffer = {
      active: { type: "normal" as const },
      onBufferChange: vi.fn(
        (listener: (buffer: { type: "normal" | "alternate" }) => void) => {
          bufferChange = listener;
          return { dispose: disposeBufferChange };
        },
      ),
    };

    loadAddon() {}

    refresh = refresh;

    open(container: HTMLElement) {
      this.element = document.createElement("div");
      container.appendChild(this.element);
    }

    dispose() {}
  },
}));

vi.mock("./utils/themes", () => ({
  applyTerminalThemeTokens: vi.fn(),
  clearTerminalThemeTokens: vi.fn(),
  syncTerminalTheme: vi.fn(),
}));

import { Terminal } from "./index";

describe("Terminal resize tracking", () => {
  let observerCallback: ResizeObserverCallback;
  let animationFrames: FrameRequestCallback[];
  const disconnect = vi.fn();
  const observe = vi.fn();

  beforeEach(() => {
    fit.mockReset();
    refresh.mockReset();
    disconnect.mockClear();
    disposeBufferChange.mockClear();
    observe.mockClear();
    bufferChange = undefined;

    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observerCallback = callback;
        }

        disconnect = disconnect;
        observe = observe;
      },
    );
    animationFrames = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("observes both the host and the FitAddon measurement container", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const terminal = new Terminal(host);
    const viewport = host.querySelector(".ai-terminal-viewport");

    expect(viewport).toBeInstanceOf(HTMLElement);
    expect(observe).toHaveBeenNthCalledWith(1, host);
    expect(observe).toHaveBeenNthCalledWith(2, viewport);

    observerCallback([], {} as ResizeObserver);
    terminal.dispose();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("hides overlay cards only while the terminal uses the alternate screen", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const terminal = new Terminal(host);
    const viewport = host.querySelector<HTMLElement>(".ai-terminal-viewport");

    expect(viewport?.classList.contains("ai-terminal-fullscreen-mode")).toBe(false);

    bufferChange?.({ type: "normal" });
    expect(viewport?.classList.contains("ai-terminal-fullscreen-mode")).toBe(false);

    bufferChange?.({ type: "alternate" });
    expect(viewport?.classList.contains("ai-terminal-fullscreen-mode")).toBe(true);

    bufferChange?.({ type: "normal" });
    expect(viewport?.classList.contains("ai-terminal-fullscreen-mode")).toBe(false);

    terminal.dispose();
    expect(disposeBufferChange).toHaveBeenCalledOnce();
  });

  it("hides the cursor only while a model request is in flight", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const terminal = new Terminal(host, {
      agentPrompt: "Ask AI",
      inputRouter: {
        clearInputLine: vi.fn(),
        isAtPrompt: vi.fn(() => true),
        onAgentRequest: vi.fn(),
        readInputLine: vi.fn(() => ""),
        write: vi.fn(),
      },
    });
    const internals = terminal as unknown as {
      agentPromptAddon: { setInputState: ReturnType<typeof vi.fn> };
      inputRouterAddon: {
        options: {
          onInputStateChange: (state: {
            agentRequestInFlight: boolean;
            enabled: boolean;
            input: string;
          }) => void;
        };
      };
    };
    const setInputState = vi.spyOn(
      internals.agentPromptAddon,
      "setInputState",
    );

    internals.inputRouterAddon.options.onInputStateChange({
      agentRequestInFlight: true,
      enabled: false,
      input: "",
    });
    expect(setInputState).toHaveBeenLastCalledWith(false, "", {
      hideCursor: true,
    });

    internals.inputRouterAddon.options.onInputStateChange({
      agentRequestInFlight: false,
      enabled: false,
      input: "",
    });
    expect(setInputState).toHaveBeenLastCalledWith(false, "", {
      hideCursor: false,
    });

    terminal.dispose();
  });

  it("suppresses transport resize notifications for inline card layout refreshes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const terminal = new Terminal(host);
    const viewport = host.querySelector<HTMLElement>(".ai-terminal-viewport");

    expect(viewport).toBeInstanceOf(HTMLElement);
    vi.spyOn(viewport!, "getBoundingClientRect").mockReturnValue({
      width: 640,
      height: 320,
    } as DOMRect);

    animationFrames.splice(0).forEach((callback) => callback(0));
    fit.mockClear();
    fit.mockImplementation(() => {
      expect(terminal.shouldNotifyTransportResize()).toBe(false);
    });

    terminal.refreshForContentLayout();
    animationFrames.shift()?.(0);

    expect(fit).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith(0, 23);
  });
});
