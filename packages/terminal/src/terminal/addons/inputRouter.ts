import type { IDisposable, ITerminalAddon, Terminal as XTerminal } from "@xterm/xterm";

import type {
  InputRouterAddonOptions,
  InputRouterInputState,
} from "../types/inputRouter";
import { TerminalCommandDetector } from "../utils/terminalCommandDetector";

const DEFAULT_AGENT_PREFIX = "#";
const ENTER_KEYS = new Set(["\r", "\n", "\r\n"]);

/**
 * Routes keystrokes between the shell and the agent.
 *
 * Unlike the local-echo addon it replaces, this does not echo anything: the PTY
 * is authoritative, so the shell renders the prompt and the typed line itself.
 * The only thing decided here is where a submitted line goes.
 *
 * Routing is only attempted while the shell reports a prompt. A shell without
 * OSC 133 integration is deliberately treated as a plain terminal: without a
 * trustworthy input boundary, offering AI could swallow commands.
 */
export class InputRouterAddon implements ITerminalAddon {
  private terminal?: XTerminal;
  private dataDisposable?: IDisposable;
  private writeParsedDisposable?: IDisposable;
  private cursorMoveDisposable?: IDisposable;
  private agentRequestInFlight = false;

  constructor(private readonly options: InputRouterAddonOptions) {}

  activate(terminal: XTerminal) {
    this.terminal = terminal;
    this.dataDisposable = terminal.onData((data) => {
      void this.handleData(data);
    });
    this.writeParsedDisposable = terminal.onWriteParsed(() => {
      // Shell completion redraws the current line without producing another
      // user-input event. Re-read it after xterm has parsed the redraw so the
      // prompt hint follows the completed command instead of reappearing.
      this.notifyInputState();
    });
    this.cursorMoveDisposable = terminal.onCursorMove(() => {
      // Completion and history navigation can move the cursor after the
      // shell redraws the line. Re-read the rendered input at that point too.
      this.notifyInputState();
    });
    terminal.attachCustomKeyEventHandler((event) => this.handleKeyEvent(event));
    this.notifyInputState();
  }

  dispose() {
    this.dataDisposable?.dispose();
    this.dataDisposable = undefined;
    this.writeParsedDisposable?.dispose();
    this.writeParsedDisposable = undefined;
    this.cursorMoveDisposable?.dispose();
    this.cursorMoveDisposable = undefined;
    this.terminal = undefined;
  }

  /** Re-reads the pending line, e.g. after the shell redrew the prompt. */
  notifyInputState() {
    const enabled =
      !this.isAlternateScreen() &&
      !this.agentRequestInFlight &&
      this.options.isAtPrompt();
    const state: InputRouterInputState = {
      agentRequestInFlight: this.agentRequestInFlight,
      enabled,
      input: enabled ? this.options.readInputLine() : "",
    };
    this.options.onInputStateChange?.(state);
  }

  isAgentRequestInFlight() {
    return this.agentRequestInFlight;
  }

  private async handleData(data: string) {
    if (this.agentRequestInFlight) {
      return;
    }

    if (this.isAlternateScreen()) {
      this.options.write(data);
      return;
    }

    // A command is running, a full-screen program is up, or the shell has not
    // reported a prompt yet: the shell owns every byte. Unsupported nested
    // shells stay in this path and therefore do not expose AI.
    if (!this.options.isAtPrompt()) {
      this.options.write(data);
      return;
    }

    if (!ENTER_KEYS.has(data)) {
      this.options.write(data);
      // The shell has not echoed the new character yet, so read after a turn.
      queueMicrotask(() => this.notifyInputState());
      return;
    }

    const line = this.options.readInputLine();
    const request = this.resolveAgentRequest(line);

    if (request === null) {
      // This is a command, let shell execute it normally
      this.options.write(data, false, line);
      this.notifyInputState();
      return;
    }

    // Keep the request visible in scrollback while the agent owns the line.
    // Clear readline before local card rows move xterm's cursor away from the
    // shell's cursor. The transport suppresses only this clear's visual echo,
    // leaving the submitted text visible as the card anchor.
    this.options.write("", true);
    this.options.onAgentInputSubmitted?.();
    await this.runAgentRequest(request, true);
  }

  /**
   * Returns the request to send to the agent, or null to let the shell run the
   * line. The explicit prefix wins; otherwise only high-confidence natural
   * language is diverted, so an ordinary command is never swallowed.
   */
  private resolveAgentRequest(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }

    const prefix = this.options.agentPrefix ?? DEFAULT_AGENT_PREFIX;
    if (prefix && trimmed.startsWith(prefix)) {
      const request = trimmed.slice(prefix.length).trim();
      return request || null;
    }

    const shouldRoute =
      this.options.shouldRouteToAgent ??
      ((input: string) => TerminalCommandDetector.agentConfidence(input) === "high");

    return shouldRoute(trimmed) ? trimmed : null;
  }

  private async runAgentRequest(request: string, finishShellLine = false) {
    if (this.agentRequestInFlight) {
      return false;
    }

    this.agentRequestInFlight = true;
    this.notifyInputState();
    try {
      await this.options.onAgentRequest(request);
    } catch (error) {
      console.error("Terminal agent request failed", error);
    } finally {
      if (finishShellLine) {
        this.options.write("\r\n");
      }
      this.agentRequestInFlight = false;
      this.notifyInputState();
    }
    return true;
  }

  /**
   * Handles shortcuts that never reach the PTY. Anything not claimed here is
   * passed to xterm untouched, so shell keybindings keep working.
   */
  private handleKeyEvent(event: KeyboardEvent) {
    if (event.type !== "keydown") {
      return true;
    }

    const key = event.key.toLowerCase();
    // Cmd/Ctrl+Shift+I: send the pending line to the agent without a prefix.
    const isAgentShortcut =
      key === "i" && (event.metaKey || (event.ctrlKey && event.shiftKey));
    const canUseShortcuts =
      !this.isAlternateScreen() &&
      this.options.isAtPrompt();
    if (isAgentShortcut && canUseShortcuts) {
      const line = this.options.readInputLine().trim();
      if (line) {
        event.preventDefault();
        this.options.clearInputLine();
        void this.runAgentRequest(line);
        return false;
      }
    }

    return true;
  }

  private isAlternateScreen() {
    return this.options.isAlternateScreen?.() === true;
  }
}
