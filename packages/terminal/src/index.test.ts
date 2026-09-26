// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const resizeDisposable = { dispose: vi.fn() };
  const shellIntegrationAddon = {
    isAtPrompt: vi.fn(() => true),
    noteInput: vi.fn(),
    noteOutput: vi.fn(),
    sanitizeInput: vi.fn((data: string) => data),
    readInputLine: vi.fn(() => ""),
    clearInputLine: vi.fn(),
    setCwd: vi.fn(),
  };
  const terminal = {
    onResize: vi.fn(() => resizeDisposable),
    // xterm invokes the callback once the chunk has been parsed.
    write: vi.fn((_data: string, callback?: () => void) => callback?.()),
  };
  let terminalOptions: Record<string, unknown> = {};

  return {
    resizeDisposable,
    shellIntegrationAddon,
    terminal,
    terminalOptions,
  };
});

vi.mock("./terminal", () => ({
  Terminal: class {
    constructor(_container: HTMLElement, options: Record<string, unknown>) {
      harness.terminalOptions = options;
      // InputRouterAddon activates during Terminal construction and immediately
      // asks for its initial prompt state.
      const inputRouter = options.inputRouter as
        | { isAtPrompt?: () => boolean; readInputLine?: () => string }
        | undefined;
      inputRouter?.isAtPrompt?.();
      inputRouter?.readInputLine?.();
    }

    terminal = harness.terminal;

    shellIntegrationAddon = harness.shellIntegrationAddon;

    modelSessionAddon = undefined;

    dispose = vi.fn();

    executeCommand = vi.fn(() => Promise.resolve());

    refreshTheme = vi.fn();

    refreshLocale = vi.fn();

    setThemeTokens = vi.fn();

    resetTheme = vi.fn();

    shouldNotifyTransportResize = vi.fn(() => true);
  },
}));

vi.mock("./terminal/i18n", () => ({
  createChatTerminalI18n: vi.fn(() => ({
    t: (key: string) => key,
    setLocale: vi.fn(),
    setMessages: vi.fn(),
  })),
}));

import { initTerminal } from "./index";
import type { TerminalSession, TerminalTransport } from "./transport";

const SESSION: TerminalSession = {
  currentDirectory: "/workspace/project",
  shell: "zsh",
  supportsBlocks: true,
  subshellBootstrap: "eval bootstrap",
};

describe("initTerminal", () => {
  afterEach(() => {
    vi.clearAllMocks();
    harness.terminalOptions = {};
  });

  it("writes PTY output straight to xterm and nudges the subshell watch", () => {
    const { transport, emit, terminal } = setup();

    emit.output("total 0\r\n");

    expect(harness.terminal.write).toHaveBeenCalledWith(
      "total 0\r\n",
      expect.any(Function),
    );
    // The write callback runs after xterm parsed the chunk, so the OSC handlers
    // have already seen whether a nested shell announced itself.
    expect(harness.shellIntegrationAddon.noteOutput).toHaveBeenCalledOnce();
    expect(transport.connect).toHaveBeenCalledOnce();

    terminal.dispose();
  });

  it("survives input router activation during terminal construction", () => {
    expect(() => setup()).not.toThrow();
  });

  it("publishes the session directory to the shell integration", () => {
    const { emit, terminal } = setup();

    emit.session(SESSION);

    expect(harness.shellIntegrationAddon.setCwd).toHaveBeenCalledWith(
      "/workspace/project",
    );

    terminal.dispose();
  });

  it("reports a shell that cannot frame commands as degraded", () => {
    const onDegraded = vi.fn();
    const { emit, terminal } = setup({ onDegraded });

    emit.session(SESSION);
    expect(onDegraded).not.toHaveBeenCalled();

    const plain = { ...SESSION, shell: "sh", supportsBlocks: false };
    emit.session(plain);
    expect(onDegraded).toHaveBeenCalledWith(plain);

    terminal.dispose();
  });

  it("closes the host tab when the shell process exits", () => {
    const onExit = vi.fn();
    const { emit, terminal } = setup({ onExit });

    emit.exit(0);

    // Covers `exit`, Ctrl-D and a killed shell alike: the PTY reports it.
    expect(onExit).toHaveBeenCalledWith(0);

    terminal.dispose();
  });

  it("reports transport errors through onError instead of throwing", () => {
    const onError = vi.fn();
    const { emit, terminal } = setup({ onError });

    const error = new Error("终端连接已断开");
    emit.error(error);

    expect(onError).toHaveBeenCalledWith(error);

    terminal.dispose();
  });

  it("routes the agent prefix through the input router options", () => {
    const { terminal } = setup({ agentPrefix: "?" });
    const inputRouter = harness.terminalOptions.inputRouter as {
      agentPrefix?: string;
      isAtPrompt: () => boolean;
      write: (data: string) => void;
    };

    expect(inputRouter.agentPrefix).toBe("?");
    expect(inputRouter.isAtPrompt()).toBe(true);

    inputRouter.write("ls\r");
    expect(harness.shellIntegrationAddon.isAtPrompt).toHaveBeenCalled();

    terminal.dispose();
  });

  it("sanitizes credential paste data before sending it to the PTY", () => {
    const { terminal, transport } = setup();
    harness.shellIntegrationAddon.sanitizeInput.mockReturnValueOnce("secret");
    const inputRouter = harness.terminalOptions.inputRouter as {
      write: (data: string) => void;
    };

    inputRouter.write("\x1b[200~secret\x1b[201~");

    expect(transport.input).toHaveBeenCalledWith("secret", undefined, undefined);
    expect(harness.shellIntegrationAddon.noteInput).toHaveBeenCalledWith("secret");
    terminal.dispose();
  });

  it("tears down every subscription on dispose", () => {
    const { transport, terminal, disposables } = setup();

    terminal.dispose();

    for (const disposable of disposables) {
      expect(disposable.dispose).toHaveBeenCalled();
    }
    expect(harness.resizeDisposable.dispose).toHaveBeenCalled();
    expect(transport.dispose).toHaveBeenCalled();
  });
});

function setup(options: Partial<Parameters<typeof initTerminal>[0]> = {}) {
  const disposables: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const track = () => {
    const disposable = { dispose: vi.fn() };
    disposables.push(disposable);
    return disposable;
  };

  let outputListener: ((data: string) => void) | undefined;
  let sessionListener: ((session: TerminalSession) => void) | undefined;
  let exitListener: ((exitCode: number | null) => void) | undefined;
  let errorListener: ((error: Error) => void) | undefined;

  const transport: TerminalTransport = {
    connect: vi.fn(() => new Promise<never>(() => undefined)),
    input: vi.fn(),
    resize: vi.fn(),
    signal: vi.fn(),
    onOutput: vi.fn((listener) => {
      outputListener = listener;
      return track();
    }),
    onSessionChange: vi.fn((listener) => {
      sessionListener = listener;
      return track();
    }),
    onExit: vi.fn((listener) => {
      exitListener = listener;
      return track();
    }),
    onError: vi.fn((listener) => {
      errorListener = listener;
      return track();
    }),
    dispose: vi.fn(),
  };

  const terminal = initTerminal({
    el: document.createElement("div"),
    ...options,
    transport: { terminal: transport },
  });

  return {
    disposables,
    emit: {
      output: (data: string) => outputListener?.(data),
      session: (session: TerminalSession) => sessionListener?.(session),
      exit: (exitCode: number | null) => exitListener?.(exitCode),
      error: (error: Error) => errorListener?.(error),
    },
    terminal,
    transport,
  };
}
