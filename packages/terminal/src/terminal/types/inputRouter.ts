import type { MaybePromise } from "./common";

export interface InputRouterInputState {
  /** True while a natural-language request owns the terminal input line. */
  agentRequestInFlight: boolean;
  /** What the user has typed at the prompt, empty while a command runs. */
  input: string;
  /** False while a command is running, i.e. the shell owns the keyboard. */
  enabled: boolean;
}

export interface InputRouterAddonOptions {
  /**
   * Sends keystrokes to the PTY verbatim.
   * When clearBuffer is true, the backend clears the readline buffer first.
   */
  write: (data: string, clearBuffer?: boolean, inputLine?: string) => void;
  /** True only when the shell reported it is showing a prompt. */
  isAtPrompt: () => boolean;
  /** True when we're in an unintegrated subshell (e.g., SSH without shell integration). */
  isInUnintegratedSubshell?: () => boolean;
  /** True while a full-screen application owns xterm's alternate buffer. */
  isAlternateScreen?: () => boolean;
  /** Reads the pending input line out of the terminal buffer. */
  readInputLine: () => string;
  /** Discards the pending input line in the shell. */
  clearInputLine: () => void;
  /** Removes inline model-session cards when the terminal screen is cleared. */
  onClearScreen?: () => void;
  /** Called before submitting a natural-language line to prepare the agent card. */
  onAgentInputSubmitted?: () => void;
  /** Hands a natural-language request to the agent. */
  onAgentRequest: (request: string) => MaybePromise<void>;
  /**
   * Prefix that always routes to the agent, defaulting to `#`. It is also a
   * shell comment, so a mis-route still cannot execute anything.
   */
  agentPrefix?: string;
  /**
   * Heuristic fallback for input without the explicit prefix. Defaults to
   * routing only high-confidence natural language.
   */
  shouldRouteToAgent?: (input: string) => boolean;
  onInputStateChange?: (state: InputRouterInputState) => void;
}
