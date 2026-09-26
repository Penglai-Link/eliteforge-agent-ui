import type { ChatTerminalI18n, ChatTerminalMessageKey } from "../i18n";

export interface AgentPromptAddonOptions {
  text?: string;
  textKey?: ChatTerminalMessageKey;
  i18n?: ChatTerminalI18n;
  color?: string;
  gapCells?: number;
}
