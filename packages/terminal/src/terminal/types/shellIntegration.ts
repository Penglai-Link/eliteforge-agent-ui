import type { IMarker } from "@xterm/xterm";

/**
 * Where the shell currently is, as reported by the OSC 133 markers.
 *
 * `unknown` means no marker has been seen yet, or the shell cannot report
 * boundaries at all. Callers must treat it like `executing`: pass input straight
 * through and do not assume a prompt is on screen.
 */
export type ShellIntegrationState = "unknown" | "prompt" | "input" | "executing";

export interface TerminalCommandBlock {
  id: string;
  /** The command line the shell reported via `OSC 633 ; E`. */
  command: string;
  /** Null when the shell reported no status, e.g. a killed foreground job. */
  exitCode: number | null;
  /** Working directory the command ran in. */
  cwd: string;
  /** Column where the shell started accepting the command text. */
  commandStartColumn?: number;
  /**
   * Markers, not row numbers: absolute rows shift once the scrollback starts
   * trimming, and xterm keeps markers pointed at the right line. They are owned
   * by `ShellIntegrationAddon`, which disposes them when the block is evicted.
   */
  promptMarker?: IMarker;
  /** Marker at the beginning of the command text after the shell prompt. */
  commandMarker?: IMarker;
  outputMarker?: IMarker;
  endMarker?: IMarker;
  /** First row of the block, or -1 once the line has been trimmed away. */
  readonly startLine: number;
  /** Last row of the block, or -1 once the line has been trimmed away. */
  readonly endLine: number;
  /** Reads the plain-text output of this block out of the terminal buffer. */
  readOutput: () => string;
}

export interface SubshellDetection {
  /** The command that opened the subshell, e.g. `ssh build@10.0.0.4`. */
  command: string;
  /** Best-effort host taken from the command, used to remember the choice. */
  host: string;
}

export interface ShellIntegrationAddonOptions {
  /**
   * Writes bytes to the PTY. Used by `executeCommand` and by the subshell
   * bootstrap; nothing else in this addon writes to the shell.
   */
  write: (data: string) => void;
  /**
   * How long to wait after a subshell-opening command stops producing output
   * before concluding the nested shell has no integration.
   */
  subshellDetectionDelayMs?: number;
  /** Maximum rows of output a block will read back for the AI. */
  maxOutputLines?: number;
}

export interface ShellIntegrationEvents {
  onPromptStart: () => void;
  onCommandStart: (command: string) => void;
  onCommandFinish: (block: TerminalCommandBlock) => void;
  onCwdChange: (cwd: string) => void;
  onStateChange: (state: ShellIntegrationState) => void;
  onSubshellDetected: (detection: SubshellDetection) => void;
}

/** Internal bookkeeping for the command currently between `133;B` and `133;D`. */
export interface PendingCommand {
  id: string;
  command: string;
  cwd: string;
  commandStartColumn?: number;
  promptMarker?: IMarker;
  commandMarker?: IMarker;
  outputMarker?: IMarker;
}
