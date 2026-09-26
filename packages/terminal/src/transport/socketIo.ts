import {
  io,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from "socket.io-client";

import {
  parseTerminalExit,
  parseTerminalOutput,
  parseTerminalSession,
} from "./protocol";
import type {
  TerminalSession,
  TerminalSignalName,
  TerminalSize,
  TerminalTransport,
  TransportDisposable,
} from "./types";

interface ServerToClientEvents {
  "terminal:output": (response: unknown) => void;
  "terminal:session": (response: unknown) => void;
  "terminal:exit": (response: unknown) => void;
}

interface ClientToServerEvents {
  "terminal:input": (payload: {
    data: string;
    clearBuffer?: boolean;
    inputLine?: string;
  }) => void;
  "terminal:resize": (payload: TerminalSize) => void;
  "terminal:signal": (payload: { signal: TerminalSignalName }) => void;
}

export interface TerminalTransportOptions {
  url: string;
  socketOptions?: Partial<ManagerOptions & SocketOptions>;
}

type TerminalTransportRuntimeOptions = Omit<TerminalTransportOptions, "url">;

/**
 * Streams a remote PTY over socket.io.
 *
 * There is no command framing here: keystrokes go to the PTY verbatim and every
 * byte the PTY produces comes back. Command boundaries are recovered from the
 * shell integration markers embedded in the stream, which is what keeps blocks
 * and AI routing working inside `ssh`, `vim` and other nested programs.
 */
export class SocketIoTerminalTransport implements TerminalTransport {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private readonly outputListeners = new Set<(data: string) => void>();
  private readonly sessionListeners = new Set<(session: TerminalSession) => void>();
  private readonly exitListeners = new Set<(exitCode: number | null) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  /** Output that arrived before any listener attached. */
  private bufferedOutput: string[] = [];
  private connecting?: Promise<TerminalSession>;
  private rejectConnecting?: (reason: Error) => void;
  private resolveConnecting?: (session: TerminalSession) => void;
  private currentSession?: TerminalSession;
  private latestSize?: TerminalSize;
  private destroyed = false;

  constructor(url: string, options: TerminalTransportRuntimeOptions = {}) {
    this.socket = io(url, {
      reconnection: true,
      timeout: 10_000,
      transports: ["websocket"],
      ...options.socketOptions,
      // Every terminal owns an independent PTY session. Prevent socket.io from
      // reusing a Manager (and therefore a client connection) for another tab.
      forceNew: true,
      multiplex: false,
      autoConnect: false,
    });

    this.socket.on("terminal:output", (response) => this.handleOutput(response));
    this.socket.on("terminal:session", (response) => this.handleSession(response));
    this.socket.on("terminal:exit", (response) => this.handleExit(response));
    this.socket.on("disconnect", () => {
      this.currentSession = undefined;
      this.failConnection(new Error("终端连接已断开"));
    });
    this.socket.on("connect_error", () => {
      this.failConnection(new Error("无法连接终端服务"));
    });
  }

  connect(): Promise<TerminalSession> {
    if (this.destroyed) {
      return Promise.reject(new Error("终端已销毁"));
    }

    if (this.socket.connected && this.currentSession) {
      return Promise.resolve(this.currentSession);
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = new Promise<TerminalSession>((resolve, reject) => {
      this.resolveConnecting = resolve;
      this.rejectConnecting = reject;
    });

    if (!this.socket.connected) {
      this.socket.connect();
    }

    return this.connecting;
  }

  input(data: string, clearBuffer?: boolean, inputLine?: string) {
    if ((!data && !clearBuffer) || this.destroyed || !this.currentSession) {
      return;
    }

    this.socket.emit("terminal:input", { data, clearBuffer, inputLine });
  }

  signal(name: TerminalSignalName) {
    if (this.destroyed || !this.currentSession) {
      return;
    }

    this.socket.emit("terminal:signal", { signal: name });
  }

  resize(size: TerminalSize) {
    if (!isTerminalSize(size)) {
      return;
    }

    this.latestSize = size;
    this.emitTerminalSize();
  }

  onOutput(listener: (data: string) => void): TransportDisposable {
    this.outputListeners.add(listener);
    if (this.bufferedOutput.length > 0) {
      const buffered = this.bufferedOutput;
      this.bufferedOutput = [];
      for (const data of buffered) {
        listener(data);
      }
    }

    return {
      dispose: () => {
        this.outputListeners.delete(listener);
      },
    };
  }

  onSessionChange(
    listener: (session: TerminalSession) => void,
  ): TransportDisposable {
    this.sessionListeners.add(listener);
    if (this.currentSession) {
      listener(this.currentSession);
    }

    return {
      dispose: () => {
        this.sessionListeners.delete(listener);
      },
    };
  }

  onExit(listener: (exitCode: number | null) => void): TransportDisposable {
    this.exitListeners.add(listener);

    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }

  onError(listener: (error: Error) => void): TransportDisposable {
    this.errorListeners.add(listener);

    return {
      dispose: () => {
        this.errorListeners.delete(listener);
      },
    };
  }

  dispose() {
    this.destroyed = true;
    this.currentSession = undefined;
    this.failConnection(new Error("终端连接已关闭"));
    this.outputListeners.clear();
    this.sessionListeners.clear();
    this.exitListeners.clear();
    this.errorListeners.clear();
    this.bufferedOutput = [];
    this.socket.disconnect();
  }

  private handleOutput(response: unknown) {
    const data = parseTerminalOutput(response);
    if (data === undefined) {
      console.warn("忽略格式错误的终端输出", response);
      return;
    }
    if (!data) {
      return;
    }

    if (this.outputListeners.size === 0) {
      this.bufferedOutput.push(data);
      return;
    }

    for (const listener of this.outputListeners) {
      listener(data);
    }
  }

  private handleSession(response: unknown) {
    const parsed = parseTerminalSession(response);
    if (!parsed) {
      console.warn("忽略格式错误的终端会话消息", response);
      return;
    }

    const session = parsed.session;
    if (!session) {
      this.currentSession = undefined;
      this.failConnection(new Error(parsed.error ?? "终端会话创建失败"));
      return;
    }

    this.currentSession = session;
    for (const listener of this.sessionListeners) {
      listener(session);
    }
    this.emitTerminalSize();
    this.settleConnection(session);
  }

  private handleExit(response: unknown) {
    const parsed = parseTerminalExit(response);
    const exitCode = parsed?.exitCode ?? null;

    this.currentSession = undefined;
    for (const listener of this.exitListeners) {
      listener(exitCode);
    }
  }

  private emitTerminalSize() {
    if (!this.latestSize || !this.socket.connected || !this.currentSession) {
      return;
    }

    this.socket.emit("terminal:resize", this.latestSize);
  }

  private settleConnection(session: TerminalSession) {
    const resolve = this.resolveConnecting;
    this.connecting = undefined;
    this.resolveConnecting = undefined;
    this.rejectConnecting = undefined;
    resolve?.(session);
  }

  /**
   * Rejects an in-flight `connect()` and reports the failure. Errors are also
   * surfaced to `onError` listeners so a drop after a successful connect is not
   * swallowed.
   */
  private failConnection(error: Error) {
    const reject = this.rejectConnecting;
    this.connecting = undefined;
    this.resolveConnecting = undefined;
    this.rejectConnecting = undefined;

    if (reject) {
      reject(error);
      return;
    }

    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}

function isTerminalSize(value: TerminalSize) {
  return (
    Number.isInteger(value.cols) &&
    value.cols > 0 &&
    Number.isInteger(value.rows) &&
    value.rows > 0
  );
}

export function createTerminalTransport(options: TerminalTransportOptions) {
  return new SocketIoTerminalTransport(options.url, {
    socketOptions: options.socketOptions,
  });
}
