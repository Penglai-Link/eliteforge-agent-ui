export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalSession {
  currentDirectory: string;
  /** `bash`, `zsh` or `sh`. */
  shell: string;
  /**
   * False when the shell cannot report OSC 133 prompt boundaries. Command
   * blocks and prompt-aware AI routing are unavailable in that case, and the
   * terminal behaves as a plain terminal.
   */
  supportsBlocks: boolean;
  /**
   * One-liner that installs the shell integration into a shell the server did
   * not spawn, used to keep blocks working after `ssh`.
   */
  subshellBootstrap: string;
}

export type TerminalSignalName = "SIGINT" | "SIGKILL";

export interface TransportDisposable {
  dispose(): void;
}

/**
 * A raw duplex connection to the remote PTY.
 *
 * The PTY is authoritative: the shell owns echo, line editing and prompt
 * rendering, so this transport neither frames commands nor interprets output.
 * Command boundaries are derived from the shell integration markers inside the
 * output stream instead.
 */
export interface TerminalTransport {
  connect(): Promise<TerminalSession>;
  /**
   * Sends keystrokes to the PTY verbatim.
   * When clearBuffer is true, the backend will clear the readline buffer first.
   */
  input(data: string, clearBuffer?: boolean, inputLine?: string): void;
  resize(size: TerminalSize): void;
  signal(name: TerminalSignalName): void;
  onOutput(listener: (data: string) => void): TransportDisposable;
  onSessionChange(listener: (session: TerminalSession) => void): TransportDisposable;
  /** Fires when the shell process itself exits, so the host can close the tab. */
  onExit(listener: (exitCode: number | null) => void): TransportDisposable;
  onError(listener: (error: Error) => void): TransportDisposable;
  dispose(): void;
}

export interface AIStreamChunk {
  delta: string;
  requestId: string;
}

export interface AIStreamEvent {
  type: string;
  threadId?: string;
  runId?: string;
  messageId?: string;
  delta?: string | unknown[];
  content?: string;
  message?: string;
  toolCallId?: string;
  toolCallName?: string;
  toolCallArgs?: unknown;
  parentMessageId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface AIStreamResumeEntry {
  interruptId: string;
  status: "resolved" | "cancelled";
  payload: unknown;
}

export interface AIStreamOptions {
  onChunk: (chunk: AIStreamChunk) => void;
  /** Receives structured agent activity without changing text-stream behavior. */
  onEvent?: (event: AIStreamEvent) => void;
  /** Resumes an interrupted run with the user's answers. */
  resume?: AIStreamResumeEntry[];
  signal?: AbortSignal;
}

export interface AIStreamResult {
  requestId: string;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
}

export interface AITransport {
  dispose?(): void;
  /** Cancels the request associated with the signal, including its server run. */
  cancel?(signal: AbortSignal): void | Promise<void>;
  request(content: string, options?: AIRequestOptions): Promise<string>;
  stream(content: string, options: AIStreamOptions): Promise<AIStreamResult>;
}
