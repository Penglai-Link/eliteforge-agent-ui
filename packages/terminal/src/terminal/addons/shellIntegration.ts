import type {
  IDisposable,
  IMarker,
  ITerminalAddon,
  Terminal as XTerminal,
} from "@xterm/xterm";

import type {
  PendingCommand,
  ShellIntegrationAddonOptions,
  ShellIntegrationState,
  SubshellDetection,
  TerminalCommandBlock,
} from "../types/shellIntegration";
import {
  readTerminalLines,
  readTerminalRange,
  TerminalEventEmitter,
} from "../utils";
import {
  COMMAND_LINE_OSC,
  CWD_OSC,
  SEMANTIC_PROMPT_OSC,
  parseCommandLine,
  parseCwd,
  parseSemanticPrompt,
} from "../utils/oscParser";

const DEFAULT_SUBSHELL_DETECTION_DELAY_MS = 1_200;
/**
 * How many settle windows we wait for a recognisable prompt before giving up.
 *
 * Silence alone is not evidence of a remote shell: `ssh` is equally silent while
 * it waits for a password. So the watch re-arms instead of firing blind, and
 * stops rather than guessing once the budget is spent.
 */
const MAX_SUBSHELL_DETECTION_ATTEMPTS = 5;
const DEFAULT_MAX_OUTPUT_LINES = 400;
const MAX_TRACKED_BLOCKS = 200;

/** Commands that hand the PTY to a nested shell we do not control. */
const SHELL_PROGRAMS = new Set(["bash", "dash", "fish", "ksh", "sh", "zsh"]);

/**
 * Turns the OSC 133 markers the shell emits into prompt state and command blocks.
 *
 * This replaces the previous approach of guessing command boundaries from a
 * locally echoed prompt string. Because the shell itself reports the boundaries,
 * they stay correct inside `ssh`, `docker exec` and any other nested shell that
 * has the same integration installed — which is what makes prompt-aware AI
 * routing work over SSH.
 */
export class ShellIntegrationAddon implements ITerminalAddon {
  readonly promptStart = new TerminalEventEmitter<void>();
  readonly commandStart = new TerminalEventEmitter<string>();
  readonly commandFinish = new TerminalEventEmitter<TerminalCommandBlock>();
  readonly cwdChange = new TerminalEventEmitter<string>();
  readonly stateChange = new TerminalEventEmitter<ShellIntegrationState>();
  readonly subshellDetected = new TerminalEventEmitter<SubshellDetection>();

  private terminal?: XTerminal;
  private readonly disposables: IDisposable[] = [];
  private state: ShellIntegrationState = "unknown";
  private currentCwd = "";
  /** Command line reported by `OSC 633 ; E` before the block opens. */
  private reportedCommand = "";
  private pending?: PendingCommand;
  private readonly blocks: TerminalCommandBlock[] = [];
  private blockSequence = 0;
  /** Where the shell finished printing the prompt, i.e. where input begins. */
  private inputStartMarker?: IMarker;
  private inputStartColumn = 0;
  private subshellTimer?: number;
  private subshellCommand?: string;
  private awaitingAuthentication = false;
  private authenticationSubmitted = false;
  private authenticationOutputTail = "";
  /** Settle windows spent waiting for a prompt we can recognise. */
  private subshellAttempts = 0;
  /** True when we're in a detected subshell without integration. */
  private inUnintegratedSubshell = false;
  private awaitingCommandFinish?: {
    resolve: (block: TerminalCommandBlock) => void;
    reject: (error: Error) => void;
  };

  constructor(private readonly options: ShellIntegrationAddonOptions) {}

  activate(terminal: XTerminal) {
    this.terminal = terminal;

    this.disposables.push(
      terminal.parser.registerOscHandler(SEMANTIC_PROMPT_OSC, (payload) => {
        this.handleSemanticPrompt(payload);
        // Consume the sequence: it must not reach the renderer.
        return true;
      }),
      terminal.parser.registerOscHandler(COMMAND_LINE_OSC, (payload) => {
        const command = parseCommandLine(payload);
        if (command !== null) {
          this.reportedCommand = command;
        }
        return true;
      }),
      terminal.parser.registerOscHandler(CWD_OSC, (payload) => {
        const cwd = parseCwd(payload);
        if (cwd && cwd !== this.currentCwd) {
          this.currentCwd = cwd;
          this.cwdChange.fire(cwd);
        }
        return true;
      }),
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.clearSubshellWatch();
    this.inputStartMarker?.dispose();
    this.inputStartMarker = undefined;
    this.pending?.promptMarker?.dispose();
    this.pending?.commandMarker?.dispose();
    this.pending?.outputMarker?.dispose();
    this.pending = undefined;
    this.awaitingCommandFinish?.reject(new Error("终端已关闭"));
    this.awaitingCommandFinish = undefined;
    this.promptStart.clear();
    this.commandStart.clear();
    this.commandFinish.clear();
    this.cwdChange.clear();
    this.stateChange.clear();
    this.subshellDetected.clear();
    this.terminal = undefined;
  }

  getState() {
    return this.state;
  }

  getCwd() {
    return this.currentCwd;
  }

  /** True when the shell is showing a prompt and waiting for input. */
  isAtPrompt() {
    return this.state === "prompt" || this.state === "input";
  }

  /** True when we're in a subshell that doesn't have shell integration. */
  isInUnintegratedSubshell() {
    return this.inUnintegratedSubshell;
  }

  setCwd(cwd: string) {
    if (!cwd || cwd === this.currentCwd) {
      return;
    }

    this.currentCwd = cwd;
    this.cwdChange.fire(cwd);
  }

  private handleSemanticPrompt(payload: string) {
    const event = parseSemanticPrompt(payload);
    if (!event) {
      return;
    }

    switch (event.kind) {
      case "prompt-start":
        this.handlePromptStart();
        break;
      case "command-start":
        this.markInputStart();
        this.setState("input");
        break;
      case "output-start":
        this.handleOutputStart();
        break;
      case "command-end":
        this.handleCommandEnd(event.exitCode);
        break;
    }
  }

  private handlePromptStart() {
    // An interactive SSH/container command reports the remote prompt before
    // the outer command returns. Finish the outer block at that boundary so
    // its output remains explainable, then start tracking the remote prompt.
    if (
      this.pending &&
      this.state === "executing" &&
      isInteractiveSubshellCommand(this.pending.command)
    ) {
      this.finishPendingCommand(null);
    }

    // A prompt appearing while we were watching for a subshell means the nested
    // shell does have the integration, so there is nothing to bootstrap.
    this.clearSubshellWatch();
    this.inUnintegratedSubshell = false;
    this.discardPending();

    this.blockSequence += 1;
    this.pending = {
      id: `block-${this.blockSequence}`,
      command: "",
      cwd: this.currentCwd,
      promptMarker: this.terminal?.registerMarker() ?? undefined,
    };
    this.setState("prompt");
    this.promptStart.fire();
  }

  private handleOutputStart() {
    if (!this.pending) {
      // Integration installed mid-session: adopt the command without a prompt.
      this.blockSequence += 1;
      this.pending = {
        id: `block-${this.blockSequence}`,
        command: "",
        cwd: this.currentCwd,
      };
    }

    this.pending.command = this.reportedCommand;
    this.pending.commandStartColumn = this.inputStartColumn;
    this.pending.commandMarker = this.inputStartMarker;
    this.inputStartMarker = undefined;
    this.reportedCommand = "";
    this.pending.outputMarker = this.terminal?.registerMarker() ?? undefined;
    this.setState("executing");
    this.commandStart.fire(this.pending.command);
    this.watchForSubshell(this.pending.command);
  }

  private handleCommandEnd(exitCode: number | null) {
    this.finishPendingCommand(exitCode);
  }

  private finishPendingCommand(exitCode: number | null) {
    this.clearSubshellWatch();
    this.inUnintegratedSubshell = false;

    const pending = this.pending;
    const terminal = this.terminal;
    this.pending = undefined;
    // The next prompt has not been printed yet, so no prompt is on screen.
    this.setState("unknown");

    if (!pending || !terminal) {
      return;
    }

    const block = this.createBlock(pending, exitCode, terminal);
    this.trackBlock(block);

    const awaiting = this.awaitingCommandFinish;
    this.awaitingCommandFinish = undefined;
    awaiting?.resolve(block);

    this.commandFinish.fire(block);
  }

  private createBlock(
    pending: PendingCommand,
    exitCode: number | null,
    terminal: XTerminal,
  ): TerminalCommandBlock {
    const promptMarker = pending.promptMarker;
    const commandMarker = pending.commandMarker;
    const outputMarker = pending.outputMarker;
    const endMarker = terminal.registerMarker() ?? undefined;
    const maxOutputLines = this.options.maxOutputLines ?? DEFAULT_MAX_OUTPUT_LINES;

    return {
      id: pending.id,
      command: pending.command,
      exitCode,
      cwd: pending.cwd,
      commandStartColumn: pending.commandStartColumn,
      promptMarker,
      commandMarker,
      outputMarker,
      endMarker,
      get startLine() {
        return promptMarker?.line ?? outputMarker?.line ?? -1;
      },
      get endLine() {
        return endMarker?.line ?? -1;
      },
      readOutput: () => {
        // Output starts on the row after the marker, which still holds the
        // command line the shell echoed.
        const start = outputMarker?.line ?? -1;
        const end = endMarker?.line ?? -1;
        if (start < 0 || end < 0) {
          return "";
        }

        return readTerminalLines(terminal, start + 1, end, maxOutputLines);
      },
    };
  }

  private setState(state: ShellIntegrationState) {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.stateChange.fire(state);
  }

  private discardPending() {
    this.pending?.promptMarker?.dispose();
    this.pending?.commandMarker?.dispose();
    this.pending?.outputMarker?.dispose();
    this.pending = undefined;
  }

  /**
   * Keeps a bounded history of blocks. Markers are disposed on eviction, which
   * also disposes any decoration another addon registered against them.
   */
  private trackBlock(block: TerminalCommandBlock) {
    this.blocks.push(block);

    while (this.blocks.length > MAX_TRACKED_BLOCKS) {
      const evicted = this.blocks.shift();
      evicted?.promptMarker?.dispose();
      evicted?.commandMarker?.dispose();
      evicted?.outputMarker?.dispose();
      evicted?.endMarker?.dispose();
    }
  }

  /**
   * Watches for a nested shell that has no integration of its own.
   *
   * `ssh host` is a single command from the local shell's point of view, so the
   * local shell reports `133;C` and then stays silent until the session ends. If
   * the remote shell has the integration it announces itself with `133;A`; if no
   * such marker arrives once the output settles, the remote prompt is opaque to
   * us and the caller can offer to bootstrap it.
   */
  private watchForSubshell(command: string) {
    this.clearSubshellWatch();

    if (!isInteractiveSubshellCommand(command)) {
      return;
    }

    this.subshellCommand = command;
    this.restartSubshellTimer();
  }

  /** Called on every chunk of output so the timer measures settled output. */
  noteOutput(data = "") {
    if (this.subshellCommand === undefined) {
      return;
    }

    this.authenticationOutputTail = `${this.authenticationOutputTail}${data}`.slice(-512);
    if (looksLikeAuthenticationPrompt(this.authenticationOutputTail)) {
      // SSH password/passphrase prompts are not remote shells yet. Never inject
      // the bootstrap while the SSH client is still consuming credentials.
      this.awaitingAuthentication = true;
      this.authenticationSubmitted = false;
      this.clearSubshellTimer();
      return;
    }

    if (this.awaitingAuthentication) {
      // Wait for the user to submit the credential before accepting any output
      // as evidence that the remote shell is ready.
      if (!this.authenticationSubmitted) {
        return;
      }
      this.awaitingAuthentication = false;
      this.authenticationSubmitted = false;
    }

    this.restartSubshellTimer();
  }

  /** Called for bytes sent to the PTY, including SSH credential input. */
  noteInput(data: string) {
    if (
      this.subshellCommand !== undefined &&
      this.awaitingAuthentication &&
      /[\r\n]/.test(data)
    ) {
      this.authenticationSubmitted = true;
    }
  }

  /** SSH reads pasted credentials literally, so remove xterm's paste framing. */
  sanitizeInput(data: string) {
    if (!this.awaitingAuthentication) {
      return data;
    }

    return data
      .replaceAll("\x1b[200~", "")
      .replaceAll("\x1b[201~", "");
  }

  private restartSubshellTimer() {
    const command = this.subshellCommand;
    if (command === undefined) {
      return;
    }

    if (this.subshellTimer !== undefined) {
      clearTimeout(this.subshellTimer);
    }

    const delay = this.options.subshellDetectionDelayMs ?? DEFAULT_SUBSHELL_DETECTION_DELAY_MS;
    this.subshellTimer = setTimeout(() => {
      this.subshellTimer = undefined;
      if (this.subshellCommand !== command || this.state !== "executing") {
        return;
      }
      if (this.awaitingAuthentication) {
        // `noteInput` re-arms the watch once the credential is submitted.
        return;
      }

      // Settled output is necessary but not sufficient: `ssh` is just as silent
      // waiting for a password as a remote shell is waiting at its prompt. Only
      // an actual prompt on the cursor line justifies offering to bootstrap.
      if (!this.looksLikeShellPrompt()) {
        this.subshellAttempts += 1;
        if (this.subshellAttempts < MAX_SUBSHELL_DETECTION_ATTEMPTS) {
          this.restartSubshellTimer();
          return;
        }

        // Out of budget. Staying quiet loses the bootstrap offer; guessing would
        // type the payload into whatever is really reading.
        this.clearSubshellWatch();
        return;
      }

      this.subshellCommand = undefined;
      this.inUnintegratedSubshell = true;
      this.subshellDetected.fire({ command, host: parseSubshellHost(command) });
    }, delay) as unknown as number;
  }

  /**
   * True when the cursor sits after something that reads like a shell prompt.
   *
   * Read from the rendered buffer rather than from the last chunk: a prompt is
   * routinely split across PTY reads, and the row is the assembled truth.
   */
  private looksLikeShellPrompt() {
    const terminal = this.terminal;
    if (!terminal) {
      return false;
    }

    const buffer = terminal.buffer.active;
    const line = buffer.getLine(buffer.baseY + buffer.cursorY);
    if (!line) {
      return false;
    }

    const text = line.translateToString(true, 0, buffer.cursorX);
    if (!text.trim() || looksLikeAuthenticationPrompt(text)) {
      return false;
    }

    return SHELL_PROMPT_TAIL.test(text);
  }

  private clearSubshellWatch() {
    this.clearSubshellTimer();
    this.subshellCommand = undefined;
    this.subshellAttempts = 0;
    this.awaitingAuthentication = false;
    this.authenticationSubmitted = false;
    this.authenticationOutputTail = "";
    // Note: inUnintegratedSubshell is NOT cleared here because it represents
    // the current state of being in a subshell, which persists after detection.
  }

  private clearSubshellTimer() {
    if (this.subshellTimer !== undefined) {
      clearTimeout(this.subshellTimer);
      this.subshellTimer = undefined;
    }
  }

  getBlocks(): readonly TerminalCommandBlock[] {
    return this.blocks;
  }

  /**
   * Types a command at the prompt and resolves once the shell reports it
   * finished. Used by the AI command cards, which must go through the real
   * prompt so the command lands in shell history and produces a normal block.
   */
  executeCommand(command: string): Promise<TerminalCommandBlock> {
    const input = command.trim();
    if (!input) {
      return Promise.reject(new Error("命令不能为空"));
    }
    if (this.awaitingCommandFinish) {
      return Promise.reject(new Error("已有命令正在执行"));
    }
    if (!this.isAtPrompt()) {
      return Promise.reject(new Error("终端正忙，请等待当前命令结束"));
    }

    return new Promise<TerminalCommandBlock>((resolve, reject) => {
      this.awaitingCommandFinish = { resolve, reject };
      // Clear whatever the user had typed before replacing it, so the executed
      // command is exactly what the card shows.
      this.options.write(`${CLEAR_LINE}${input}\r`);
    });
  }

  /** Discards anything typed at the prompt without submitting it. */
  clearInputLine() {
    this.options.write(CLEAR_LINE);
  }

  private markInputStart() {
    this.inputStartMarker?.dispose();
    this.inputStartMarker = this.terminal?.registerMarker() ?? undefined;
    this.inputStartColumn = this.terminal?.buffer.active.cursorX ?? 0;
  }

  /**
   * Reads what the user has typed at the prompt so far.
   *
   * Taken from the rendered buffer rather than from a keystroke mirror, so it
   * stays correct through tab completion, history recall (arrow keys) and cursor
   * movement — none of which a keystroke tally could follow.
   */
  readInputLine() {
    const terminal = this.terminal;
    const marker = this.inputStartMarker;
    if (!terminal || !marker || marker.line < 0) {
      return "";
    }

    const buffer = terminal.buffer.active;
    return readTerminalRange(
      terminal,
      { line: marker.line, column: this.inputStartColumn },
      { line: buffer.baseY + buffer.cursorY, column: buffer.cursorX },
    );
  }
}

/** Readline: kill to start of line, then kill to end of line. */
const CLEAR_LINE = "\x15\x0b";

/** Best-effort host from an `ssh`/`docker exec`-style command line. */
export function parseSubshellHost(command: string) {
  const tokens = command.trim().split(/\s+/).slice(1);
  const target = tokens.find(
    (token) => !token.startsWith("-") && !SUBSHELL_VERBS.has(token),
  );
  if (!target) {
    return "";
  }

  // Strip a user prefix and any trailing path or port.
  return target.split("@").pop()?.split(":")[0] ?? "";
}

/** Returns true only for commands that are expected to expose an interactive shell. */
function isInteractiveSubshellCommand(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const executable = tokens[0]?.split("/").pop();
  if (executable === "ssh" || executable === "mosh") {
    let targetSeen = false;
    let optionValueExpected = false;
    const optionsWithValues = new Set([
      "-B",
      "-b",
      "-c",
      "-D",
      "-E",
      "-e",
      "-F",
      "-I",
      "-i",
      "-J",
      "-L",
      "-l",
      "-m",
      "-o",
      "-P",
      "-p",
      "-R",
      "-S",
      "-w",
    ]);
    for (const token of tokens.slice(1)) {
      if (optionValueExpected) {
        optionValueExpected = false;
        continue;
      }
      if (optionsWithValues.has(token)) {
        optionValueExpected = true;
        continue;
      }
      if (token.startsWith("-") && !targetSeen) {
        continue;
      }
      if (!targetSeen) {
        targetSeen = true;
        continue;
      }
      // A positional argument after the host is a remote command, not a shell.
      if (!token.startsWith("-")) {
        return false;
      }
    }
    return targetSeen;
  }

  if (
    executable !== "docker" &&
    executable !== "podman" &&
    executable !== "kubectl"
  ) {
    return false;
  }

  const action = tokens[1];
  if (action !== "exec" && action !== "run") {
    return false;
  }

  const shellIndex = tokens.findIndex((token, index) => {
    if (index < 2) return false;
    return SHELL_PROGRAMS.has(token.split("/").pop() ?? "");
  });
  if (shellIndex < 0) {
    return false;
  }

  // `-c` hands the shell a non-interactive command; there is no prompt to
  // expose to the AI in that mode.
  return !tokens.slice(shellIndex + 1).includes("-c");
}

const SUBSHELL_VERBS = new Set(["exec", "attach", "run", "-it", "compose"]);

/**
 * Anything the SSH client itself asks before a remote shell exists.
 *
 * Everything matched here is read by `ssh`, not by a shell, so a bootstrap
 * written while one of these is on screen is submitted as the credential.
 */
const AUTHENTICATION_PROMPT =
  /(?:password|passphrase|verification code|one-?time (?:code|password)|otp|token)(?:\s+for\b[^\n]*)?\s*:\s*$/im;

/** `Are you sure you want to continue connecting (yes/no/[fingerprint])?` */
const HOST_KEY_PROMPT = /\(yes\/no(?:\/\[fingerprint\])?\)\?\s*$/im;

function looksLikeAuthenticationPrompt(data: string) {
  return (
    AUTHENTICATION_PROMPT.test(data) ||
    HOST_KEY_PROMPT.test(data) ||
    /\bare you sure you want to continue connecting\b/i.test(data)
  );
}

/**
 * A prompt ends with one of these, whatever the user's PS1 looks like.
 *
 * Deliberately narrow: a false positive here types a 1.5 KB bootstrap into
 * whatever is actually reading, so an unrecognised prompt is preferable.
 */
const SHELL_PROMPT_TAIL = /[$#%>❯»]\s*$/;
