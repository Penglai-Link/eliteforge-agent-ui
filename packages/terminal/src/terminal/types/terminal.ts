import type {
  ITerminalInitOnlyOptions,
  ITerminalOptions,
} from "@xterm/xterm";
import type { AgentPromptAddonOptions } from "./agentPrompt";
import type { BlockAddonOptions } from "./blocks";
import type { InputRouterAddonOptions } from "./inputRouter";
import type { ModelSessionAddonOptions } from "./modelSession";
import type { ShellIntegrationAddonOptions } from "./shellIntegration";
import type { SubshellAddonOptions } from "../addons/subshell";
import type { TerminalThemeTokenOverrides } from "./themes";

export interface TerminalOptions
  extends ITerminalOptions,
    ITerminalInitOnlyOptions {
  agentPrompt?: string | AgentPromptAddonOptions;
  /**
   * Enables prompt/command boundary tracking. Everything prompt-aware — command
   * blocks, AI routing, the typing hint — depends on this addon being present.
   */
  shellIntegration?: ShellIntegrationAddonOptions;
  /** Routes submitted input between the shell and the agent. */
  inputRouter?: InputRouterAddonOptions;
  /** Renders finished commands as Warp-style blocks. */
  blocks?: BlockAddonOptions;
  /** Offers to install the integration into nested shells, e.g. over SSH. */
  subshell?: SubshellAddonOptions;
  modelSession?: boolean | ModelSessionAddonOptions;
  themeTokens?: TerminalThemeTokenOverrides;
}
