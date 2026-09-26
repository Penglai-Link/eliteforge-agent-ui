import type { ChatTerminalI18n } from "../i18n";
import type { MaybePromise } from "./common";
import type { CommandExplain } from "./explain";
import type { TerminalCommandBlock } from "./shellIntegration";

export interface BlockAddonOptions {
  i18n?: ChatTerminalI18n;
  /** Streams an explanation of a block's output into the explain dialog. */
  onExplain?: CommandExplain;
  /** Cancels the server-side run for an explanation request. */
  onExplainCancel?: (signal: AbortSignal) => void | Promise<void>;
  /** Sends a free-form question about a block to the agent. */
  onAskAgent?: (block: TerminalCommandBlock) => MaybePromise<void>;
  /** Re-runs a block's command at the current prompt. */
  onRerun?: (command: string) => MaybePromise<void>;
  explainTitle?: string;
  /** Maximum number of block frames kept on screen. */
  maxRenderedBlocks?: number;
}

export type BlockActionKey = "explain" | "ask" | "copy" | "rerun";
