import type { ITerminalAddon, Terminal as XTerminal } from "@xterm/xterm";

import type { ChatTerminalI18n } from "../i18n";
import type { SubshellDetection } from "../types/shellIntegration";

export interface SubshellAddonOptions {
  /** @deprecated Kept only for the terminal:session compatibility field. */
  i18n?: ChatTerminalI18n;
  /** @deprecated Nested shells are now bootstrapped by the backend. */
  write: (data: string) => void;
  /** @deprecated The client never types this string into a nested prompt. */
  getBootstrap: () => string;
  /** @deprecated No prompt-side bootstrap remains. */
  isNestedShellActive?: () => boolean;
}

/**
 * Observes nested-shell detection while backend-owned helpers install
 * integration before the target interactive shell is started.
 *
 * This addon deliberately does not write to the terminal. Prompt-side
 * Base64/eval bootstraps became shell history entries and could corrupt input
 * methods; recognized SSH and container shells now report OSC only after their
 * startup wrapper is ready. Other nested shells remain plain terminals.
 */
export class SubshellBootstrapAddon implements ITerminalAddon {
  constructor(_options: SubshellAddonOptions) {}

  activate(_terminal: XTerminal) {}

  dispose() {}

  refreshLocale() {}

  hide() {}

  handleDetection(_detection: SubshellDetection) {}
}
