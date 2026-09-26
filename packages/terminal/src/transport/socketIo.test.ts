// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
  };

  const io = vi.fn(() => socket);

  return { handlers, io, socket };
});

vi.mock("socket.io-client", () => ({
  io: socketHarness.io,
}));

import {
  SocketIoTerminalTransport,
  createTerminalTransport,
} from "./socketIo";

const SESSION = {
  currentDirectory: "/workspace",
  shell: "zsh",
  supportsBlocks: true,
  subshellBootstrap: "eval \"$(printf %s 'AAA' | base64 -d)\"",
};

describe("SocketIoTerminalTransport", () => {
  beforeEach(() => {
    socketHarness.handlers.clear();
    socketHarness.io.mockClear();
    socketHarness.socket.emit.mockClear();
    socketHarness.socket.on.mockClear();
    socketHarness.socket.connected = true;
  });

  it("resolves connect with the PTY descriptor the server reported", async () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    const onSessionChange = vi.fn();
    transport.onSessionChange(onSessionChange);
    const connection = transport.connect();

    readySession();

    await expect(connection).resolves.toEqual(SESSION);
    expect(onSessionChange).toHaveBeenCalledWith(SESSION);
  });

  it("creates a terminal transport from an options object", () => {
    const transport = createTerminalTransport({
      url: "http://terminal.test",
      socketOptions: {
        auth: { token: "token" },
      },
    });

    expect(transport).toBeInstanceOf(SocketIoTerminalTransport);
  });

  it("creates an isolated socket connection for every terminal transport", () => {
    new SocketIoTerminalTransport("http://terminal.test", {
      socketOptions: { auth: { token: "token" } },
    });

    expect(socketHarness.io).toHaveBeenCalledWith(
      "http://terminal.test",
      expect.objectContaining({
        autoConnect: false,
        forceNew: true,
        multiplex: false,
      }),
    );
  });

  it("rejects connection when the session payload reports an error", async () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    const connection = transport.connect();

    socketHarness.handlers.get("terminal:session")?.({
      error: "终端会话无法启动",
    });

    await expect(connection).rejects.toThrow("终端会话无法启动");
  });

  it("forwards keystrokes verbatim once a session exists", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");

    // No PTY yet: keystrokes would have nowhere to go.
    transport.input("ls\r");
    expect(socketHarness.socket.emit).not.toHaveBeenCalledWith(
      "terminal:input",
      expect.anything(),
    );

    readySession();
    transport.input("\x1b[A");

    expect(socketHarness.socket.emit).toHaveBeenCalledWith("terminal:input", {
      data: "\x1b[A",
    });
  });

  it("forwards the clearBuffer flag with readline input", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();

    transport.input("", true);

    expect(socketHarness.socket.emit).toHaveBeenCalledWith("terminal:input", {
      data: "",
      clearBuffer: true,
    });
  });

  it("forwards the rendered line with a command submission", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();

    transport.input("\r", false, "ssh build@host");

    expect(socketHarness.socket.emit).toHaveBeenCalledWith("terminal:input", {
      data: "\r",
      clearBuffer: false,
      inputLine: "ssh build@host",
    });
  });

  it("streams every output chunk to listeners without framing it", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();
    const onOutput = vi.fn();
    transport.onOutput(onOutput);

    emitOutput("total 0\r\n");
    emitOutput("\x1b]133;D;0\x07");

    expect(onOutput).toHaveBeenNthCalledWith(1, "total 0\r\n");
    expect(onOutput).toHaveBeenNthCalledWith(2, "\x1b]133;D;0\x07");
  });

  it("buffers output that arrives before a listener attaches", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();

    emitOutput("early ");
    emitOutput("bytes");

    const onOutput = vi.fn();
    transport.onOutput(onOutput);

    expect(onOutput.mock.calls).toEqual([["early "], ["bytes"]]);

    // The buffer is drained, not replayed to the next listener.
    const second = vi.fn();
    transport.onOutput(second);
    expect(second).not.toHaveBeenCalled();
  });

  it("reports shell exit so the host can close the tab", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();
    const onExit = vi.fn();
    transport.onExit(onExit);

    socketHarness.handlers.get("terminal:exit")?.({ exitCode: 0 });

    expect(onExit).toHaveBeenCalledWith(0);
  });

  it("reports a killed shell as an unknown exit code", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();
    const onExit = vi.fn();
    transport.onExit(onExit);

    socketHarness.handlers.get("terminal:exit")?.({ exitCode: null });

    expect(onExit).toHaveBeenCalledWith(null);
  });

  it("sends signals as signals rather than as control bytes", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();

    transport.signal("SIGINT");

    expect(socketHarness.socket.emit).toHaveBeenCalledWith("terminal:signal", {
      signal: "SIGINT",
    });
  });

  it("buffers resize until the session is ready", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");

    transport.resize({ cols: 100, rows: 40 });
    expect(socketHarness.socket.emit).not.toHaveBeenCalledWith(
      "terminal:resize",
      expect.anything(),
    );

    readySession();
    expect(socketHarness.socket.emit).toHaveBeenCalledWith("terminal:resize", {
      cols: 100,
      rows: 40,
    });
  });

  it("stops forwarding input after dispose", () => {
    const transport = new SocketIoTerminalTransport("http://terminal.test");
    readySession();
    transport.dispose();
    socketHarness.socket.emit.mockClear();

    transport.input("ls\r");

    expect(socketHarness.socket.emit).not.toHaveBeenCalled();
    expect(socketHarness.socket.disconnect).toHaveBeenCalled();
  });
});

function readySession(session: Partial<typeof SESSION> = {}) {
  socketHarness.handlers.get("terminal:session")?.({ ...SESSION, ...session });
}

function emitOutput(data: string) {
  socketHarness.handlers.get("terminal:output")?.({ data });
}
