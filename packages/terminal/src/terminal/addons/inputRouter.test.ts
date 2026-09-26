// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InputRouterAddon } from "./inputRouter";
import type { InputRouterAddonOptions } from "../types/inputRouter";

describe("InputRouterAddon", () => {
  let harness: ReturnType<typeof setup>;

  beforeEach(() => {
    harness = setup();
  });

  it("passes ordinary keystrokes to the shell without echoing them", async () => {
    harness.atPrompt(true);

    await harness.type("l");
    await harness.type("s");

    // The PTY is authoritative: the shell echoes, the router only forwards.
    expect(harness.options.write.mock.calls).toEqual([["l"], ["s"]]);
    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
  });

  it("forwards xterm's finalized IME data exactly once", async () => {
    harness.atPrompt(true);

    // xterm owns composition and emits one final onData payload. The router
    // must not inspect composition events or synthesize a second PTY write.
    await harness.type("中文");

    expect(harness.options.write.mock.calls).toEqual([["中文"]]);
  });

  it("lets a shell command run instead of routing it to the agent", async () => {
    harness.atPrompt(true, "ls -la");

    await harness.type("\r");

    expect(harness.options.write).toHaveBeenCalledWith("\r", false, "ls -la");
    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.clearInputLine).not.toHaveBeenCalled();
  });

  it("keeps a prefixed request visible and prints the next prompt after the agent completes", async () => {
    harness.atPrompt(true, "# 查看当前目录占用");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledWith("查看当前目录占用");
    expect(harness.options.clearInputLine).not.toHaveBeenCalled();
    expect(harness.options.write.mock.calls).toEqual([
      ["", true],
      ["\r\n"],
    ]);
  });

  it("reports an agent request as in flight until the response completes", async () => {
    let release = () => {};
    harness.options.onAgentRequest.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    harness.atPrompt(true, "# hide shell redraw");

    const request = harness.type("\r");
    await Promise.resolve();
    expect(harness.addon.isAgentRequestInFlight()).toBe(true);

    release();
    await request;
    expect(harness.addon.isAgentRequestInFlight()).toBe(false);
  });

  it("honours a custom agent prefix", async () => {
    harness = setup({ agentPrefix: "?" });
    harness.atPrompt(true, "? explain this repo");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledWith(
      "explain this repo",
    );
  });

  it("runs a bare prefix as a shell comment rather than an empty request", async () => {
    harness.atPrompt(true, "#");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.write).toHaveBeenCalledWith("\r", false, "#");
  });

  it("routes high-confidence natural language without a prefix", async () => {
    harness.atPrompt(true, "怎么查看端口占用");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledWith(
      "怎么查看端口占用",
    );
  });

  it("does not swallow an ordinary English command as natural language", async () => {
    harness.atPrompt(true, "git log --oneline -5");

    await harness.type("\r");

    // Decision: predictability over recall. `#` stays the reliable entry point.
    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.write).toHaveBeenCalledWith(
      "\r",
      false,
      "git log --oneline -5",
    );
  });

  it("routes Chinese input to the agent inside an SSH session", async () => {
    // Regression: AI used to die the moment `ssh` started, because routing hung
    // off a locally faked prompt that `ssh` permanently left behind. Now the
    // remote shell reports its own OSC 133 prompt, so isAtPrompt() is true there
    // and routing keeps working.
    harness.atPrompt(true, "# 远端磁盘为什么满了");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledWith(
      "远端磁盘为什么满了",
    );
    expect(harness.options.clearInputLine).not.toHaveBeenCalled();
    expect(harness.options.write.mock.calls).toEqual([
      ["", true],
      ["\r\n"],
    ]);
  });

  it("does not expose AI inside an unintegrated SSH shell", async () => {
    harness = setup({ isInUnintegratedSubshell: () => true });
    harness.atPrompt(false, "你好");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.write).toHaveBeenCalledWith("\r");
  });

  it("leaves every byte to Vim inside an unintegrated SSH shell", async () => {
    harness = setup({
      isAlternateScreen: () => true,
      isInUnintegratedSubshell: () => true,
    });
    harness.atPrompt(false, "你好");

    await harness.type("x");
    await harness.type("\u007f");
    await harness.type("\r");

    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.write.mock.calls).toEqual([
      ["x"],
      ["\u007f"],
      ["\r"],
    ]);
  });

  it("hands every byte to the shell while a command owns the keyboard", async () => {
    // A full-screen program like vim, or any command still running.
    harness.atPrompt(false, "怎么退出 vim");

    await harness.type("\r");
    await harness.type("\x1b");
    await harness.type(":wq");

    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.clearInputLine).not.toHaveBeenCalled();
    expect(harness.options.write.mock.calls).toEqual([
      ["\r"],
      ["\x1b"],
      [":wq"],
    ]);
  });

  it("treats every newline flavour as a submission", async () => {
    for (const enter of ["\r", "\n", "\r\n"]) {
      harness = setup();
      harness.atPrompt(true, "# hello");

      await harness.type(enter);

      expect(harness.options.onAgentRequest).toHaveBeenCalledWith("hello");
    }
  });

  it("ignores a blank submission", async () => {
    harness.atPrompt(true, "   ");

    await harness.type("\r");

    expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    expect(harness.options.write).toHaveBeenCalledWith("\r", false, "   ");
  });

  it("keeps the request on the prompt while the agent is streaming", async () => {
    let release = () => {};
    harness.options.onAgentRequest.mockImplementation(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    harness.atPrompt(true, "# first");

    const first = harness.type("\r");
    await Promise.resolve();

    expect(harness.options.onAgentRequest).toHaveBeenCalledWith("first");
    expect(harness.options.write).toHaveBeenCalledWith("", true);
    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: true,
      enabled: false,
      input: "",
    });

    await harness.type("x");
    expect(harness.options.write).toHaveBeenCalledTimes(1);

    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledTimes(1);
    expect(harness.options.write).toHaveBeenCalledTimes(1);

    release();
    await first;
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.options.clearInputLine).not.toHaveBeenCalled();
    expect(harness.options.write.mock.calls).toEqual([
      ["", true],
      ["\r\n"],
    ]);
    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: false,
      enabled: true,
      input: "",
    });
  });

  it("keeps accepting input after a failed agent request", async () => {
    const error = new Error("agent unreachable");
    harness.options.onAgentRequest.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.atPrompt(true, "# first");

    await harness.type("\r");
    harness.readInput("# second");
    await harness.type("\r");

    expect(harness.options.onAgentRequest).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports input state so the prompt hint can follow the shell", async () => {
    harness.atPrompt(true, "l");

    harness.addon.notifyInputState();

    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: false,
      enabled: true,
      input: "l",
    });

    harness.atPrompt(false, "ignored");
    harness.addon.notifyInputState();

    // While a command runs there is no pending input to show.
    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: false,
      enabled: false,
      input: "",
    });
  });

  it("re-reads input after shell completion redraws the line", () => {
    harness.atPrompt(true, "ls");
    harness.readInput("LS_COLORS=");
    harness.options.onInputStateChange.mockClear();

    harness.emitWriteParsed();

    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: false,
      enabled: true,
      input: "LS_COLORS=",
    });
  });

  it("re-reads input after completion moves the cursor", () => {
    harness.atPrompt(true, "ls");
    harness.readInput("LS_COLORS=");
    harness.options.onInputStateChange.mockClear();

    harness.emitCursorMove();

    expect(harness.options.onInputStateChange).toHaveBeenLastCalledWith({
      agentRequestInFlight: false,
      enabled: true,
      input: "LS_COLORS=",
    });
  });

  describe("shortcuts", () => {
    it("sends the pending line to the agent on Cmd+Shift+I", () => {
      harness.atPrompt(true, "why is this slow");
      const event = keydown("i", { metaKey: true, shiftKey: true });

      const propagate = harness.key(event);

      expect(propagate).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(harness.options.clearInputLine).toHaveBeenCalledOnce();
      expect(harness.options.onAgentRequest).toHaveBeenCalledWith(
        "why is this slow",
      );
    });

    it("leaves the shortcut to the shell when there is nothing typed", () => {
      harness.atPrompt(true, "   ");

      expect(harness.key(keydown("i", { metaKey: true }))).toBe(true);
      expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    });

    it("ignores the agent shortcut while a command is running", () => {
      harness.atPrompt(false, "anything");

      expect(harness.key(keydown("i", { metaKey: true }))).toBe(true);
      expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    });

    it("passes Cmd+K through after application clear handling is removed", () => {
      harness.atPrompt(true);
      const event = keydown("k", { metaKey: true });

      expect(harness.key(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      expect(harness.options.onClearScreen).not.toHaveBeenCalled();
    });

    it("passes unclaimed keys through so shell keybindings keep working", () => {
      harness.atPrompt(true, "text");

      expect(harness.key(keydown("a", { ctrlKey: true }))).toBe(true);
      expect(harness.key(keydown("k", { ctrlKey: true }))).toBe(true);
      expect(harness.key(keydown("l", { ctrlKey: true }))).toBe(true);
      expect(harness.key(keydown("i", { ctrlKey: true }))).toBe(true);
      expect(harness.options.write).not.toHaveBeenCalled();
    });

    it("ignores keyup so a shortcut is not handled twice", () => {
      harness.atPrompt(true, "question");
      const event = new KeyboardEvent("keyup", { key: "i", metaKey: true });

      expect(harness.key(event)).toBe(true);
      expect(harness.options.onAgentRequest).not.toHaveBeenCalled();
    });
  });

  it("stops forwarding input once disposed", () => {
    harness.addon.dispose();

    expect(harness.dataDisposable.dispose).toHaveBeenCalled();
  });
});

function setup(overrides: Partial<InputRouterAddonOptions> = {}) {
  let atPrompt = false;
  let input = "";

  // Kept separate from `overrides` so the spread does not widen the mock types.
  const options = {
    write: vi.fn((data: string, clearBuffer?: boolean) => {
      if (!data && clearBuffer) {
        input = "";
      }
    }),
    isAtPrompt: vi.fn(() => atPrompt),
    readInputLine: vi.fn(() => input),
    clearInputLine: vi.fn(() => {
      input = "";
    }),
    onClearScreen: vi.fn(),
    onAgentInputSubmitted: vi.fn(),
    onAgentRequest: vi.fn((_request: string) => Promise.resolve()),
    onInputStateChange: vi.fn(),
  };

  const dataDisposable = { dispose: vi.fn() };
  let dataListener: ((data: string) => void) | undefined;
  let writeParsedListener: (() => void) | undefined;
  let cursorMoveListener: (() => void) | undefined;
  let keyHandler: ((event: KeyboardEvent) => boolean) | undefined;

  const terminal = {
    onData: vi.fn((listener: (data: string) => void) => {
      dataListener = listener;
      return dataDisposable;
    }),
    onWriteParsed: vi.fn((listener: () => void) => {
      writeParsedListener = listener;
      return { dispose: vi.fn() };
    }),
    onCursorMove: vi.fn((listener: () => void) => {
      cursorMoveListener = listener;
      return { dispose: vi.fn() };
    }),
    attachCustomKeyEventHandler: vi.fn(
      (handler: (event: KeyboardEvent) => boolean) => {
        keyHandler = handler;
      },
    ),
  };

  const addon = new InputRouterAddon({
    ...options,
    ...overrides,
  } as InputRouterAddonOptions);
  addon.activate(terminal as never);

  return {
    addon,
    dataDisposable,
    options,
    atPrompt(next: boolean, pending = "") {
      atPrompt = next;
      input = pending;
      options.write.mockClear();
      options.onInputStateChange.mockClear();
    },
    readInput(next: string) {
      input = next;
    },
    emitWriteParsed() {
      writeParsedListener?.();
    },
    emitCursorMove() {
      cursorMoveListener?.();
    },
    async type(data: string) {
      dataListener?.(data);
      // handleData is async and re-reads the line on a microtask.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
    key(event: KeyboardEvent) {
      return keyHandler?.(event) ?? true;
    },
  };
}

function keydown(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  return new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    ...modifiers,
  });
}
