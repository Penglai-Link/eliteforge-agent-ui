import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerminal } from "@xterm/xterm";
import "./styles/index.scss";
import { AgentPromptAddon } from "./addons/agentPrompt";
import { BlockAddon } from "./addons/blocks";
import { InputRouterAddon } from "./addons/inputRouter";
import { ModelSessionAddon } from "./addons/modelSession";
import { ShellIntegrationAddon } from "./addons/shellIntegration";
import { SubshellBootstrapAddon, type SubshellAddonOptions } from "./addons/subshell";
import type {
  ChatTerminalLocale,
  ChatTerminalMessageKey,
  ChatTerminalMessageOverrides,
  ChatTerminalMessages,
} from "./i18n";
import type { AgentPromptAddonOptions } from "./types/agentPrompt";
import type { BlockActionKey, BlockAddonOptions } from "./types/blocks";
import type {
  InputRouterAddonOptions,
  InputRouterInputState,
} from "./types/inputRouter";
import type {
  CommandExplain,
  CommandExplainContext,
  CommandExplainPayload,
} from "./types/explain";
import type {
  ShellIntegrationAddonOptions,
  ShellIntegrationState,
  SubshellDetection,
  TerminalCommandBlock,
} from "./types/shellIntegration";
import type {
  ModelSessionAddonOptions,
  ModelSessionCommandActionPayload,
  ModelSessionCommandCardState,
  ModelSessionCommandStatus,
  ModelSessionMessageChunk,
  ModelSessionRenderActions,
  ModelSessionRenderState,
  ModelSessionToken,
} from "./types/modelSession";
import type { TerminalOptions } from "./types/terminal";
import type { TerminalThemeTokenOverrides } from "./types/themes";
import {
  applyTerminalThemeTokens,
  clearTerminalThemeTokens,
  syncTerminalTheme,
} from "./utils/themes";
import type {
  ExplainButtonOptions,
  ExplainDialogOptions,
  ExplainDialogPosition,
  ExplainDialogState,
  ExplainDialogStatus,
} from "./types/ui";

export {
  AgentPromptAddon,
  BlockAddon,
  InputRouterAddon,
  ModelSessionAddon,
  ShellIntegrationAddon,
  SubshellBootstrapAddon,
  type AgentPromptAddonOptions,
  type BlockActionKey,
  type BlockAddonOptions,
  type ChatTerminalLocale,
  type ChatTerminalMessageKey,
  type ChatTerminalMessageOverrides,
  type ChatTerminalMessages,
  type CommandExplain,
  type CommandExplainContext,
  type CommandExplainPayload,
  type ExplainButtonOptions,
  type ExplainDialogOptions,
  type ExplainDialogPosition,
  type ExplainDialogState,
  type ExplainDialogStatus,
  type InputRouterAddonOptions,
  type InputRouterInputState,
  type ModelSessionAddonOptions,
  type ModelSessionCommandActionPayload,
  type ModelSessionCommandCardState,
  type ModelSessionCommandStatus,
  type ModelSessionMessageChunk,
  type ModelSessionRenderActions,
  type ModelSessionRenderState,
  type ModelSessionToken,
  type ShellIntegrationAddonOptions,
  type ShellIntegrationState,
  type SubshellAddonOptions,
  type SubshellDetection,
  type TerminalCommandBlock,
  type TerminalOptions,
  type TerminalThemeTokenOverrides,
};

export class Terminal {
  terminal: XTerminal;
  modelSessionAddon?: ModelSessionAddon;
  shellIntegrationAddon?: ShellIntegrationAddon;
  private readonly fitAddon: FitAddon;
  private agentPromptAddon?: AgentPromptAddon;
  private inputRouterAddon?: InputRouterAddon;
  private blockAddon?: BlockAddon;
  private subshellAddon?: SubshellBootstrapAddon;
  private readonly integrationDisposables: { dispose: () => void }[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly terminalContainer: HTMLElement;
  private terminalThemeTokens: TerminalThemeTokenOverrides;
  private fitAnimationFrame?: number;
  private fitShouldNotifyTransport = false;
  private themeRefreshAnimationFrame?: number;
  private isFittingContentLayout = false;
  private disposed = false;

  constructor(container: HTMLElement, params: TerminalOptions = {}) {
    const {
      agentPrompt,
      blocks,
      inputRouter,
      modelSession,
      shellIntegration,
      subshell,
      themeTokens = {},
      theme: initialTheme,
      ...terminalOptions
    } = params;

    this.terminal = new XTerminal({
      ...terminalOptions,
      allowProposedApi: true,
      theme: initialTheme,
    });
    this.terminalThemeTokens = {
      ...themeTokens,
      ansi: {
        ...(initialTheme ?? {}),
        ...themeTokens.ansi,
      },
    };

    this.terminalContainer = this.createTerminalContainer(container);
    applyTerminalThemeTokens(this.terminalContainer, themeTokens);
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.terminalContainer);
    this.guardViewportSyncScrollArea();
    this.connectFullscreenVisibility();
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleFit();
    });
    // The terminal's parent is the element FitAddon measures. Observe both
    // layout boundaries so flex/sidebar changes cannot leave xterm at stale
    // columns while the inner viewport keeps its percentage size.
    this.resizeObserver.observe(container);
    this.resizeObserver.observe(this.terminalContainer);
    this.refreshTheme();
    this.scheduleThemeRefresh();
    this.scheduleFit();

    this.agentPromptAddon = agentPrompt
      ? new AgentPromptAddon(this.normalizeAgentPromptOptions(agentPrompt))
      : undefined;

    if (this.agentPromptAddon) {
      this.terminal.loadAddon(this.agentPromptAddon);
    }

    // Order matters: the integration must be tracking prompt state before the
    // router starts asking whether a prompt is on screen.
    if (shellIntegration) {
      this.shellIntegrationAddon = new ShellIntegrationAddon(shellIntegration);
      this.terminal.loadAddon(this.shellIntegrationAddon);
    }

    if (blocks) {
      this.blockAddon = new BlockAddon(blocks);
      this.terminal.loadAddon(this.blockAddon);
    }

    if (subshell) {
      this.subshellAddon = new SubshellBootstrapAddon({
        // A nested shell owns the PTY for exactly as long as the local shell
        // reports its command still executing. Once `ssh` exits — including a
        // rejected password — the local shell prints a prompt again, and the
        // bootstrap must not be typed into that.
        isNestedShellActive: () =>
          this.shellIntegrationAddon?.getState() === "executing",
        ...subshell,
      });
      this.terminal.loadAddon(this.subshellAddon);
    }

    if (inputRouter) {
      this.inputRouterAddon = new InputRouterAddon({
        ...inputRouter,
        isAlternateScreen: () =>
          this.terminal.buffer.active.type === "alternate",
        isInUnintegratedSubshell: () =>
          this.shellIntegrationAddon?.isInUnintegratedSubshell() ?? false,
        onAgentInputSubmitted: () =>
          this.modelSessionAddon?.prepareNextSessionAnchor(),
        onClearScreen: () => {
          this.modelSessionAddon?.clear();
          this.terminal.clear();
        },
        onInputStateChange: (state) => {
          inputRouter.onInputStateChange?.(state);
          this.agentPromptAddon?.setInputState(state.enabled, state.input, {
            hideCursor: state.agentRequestInFlight,
          });
        },
      });
      this.terminal.loadAddon(this.inputRouterAddon);
    }

    this.connectShellIntegration();

    if (modelSession) {
      const modelSessionOptions = this.normalizeModelSessionOptions(modelSession);
      this.modelSessionAddon = new ModelSessionAddon(
        {
          ...modelSessionOptions,
          onSessionStateChange: (active) => {
            modelSessionOptions.onSessionStateChange?.(active);
            this.agentPromptAddon?.setModelSessionActive(active);
          },
          onLayoutResize: () => {
            modelSessionOptions.onLayoutResize?.();
            this.refreshForContentLayout();
          },
        },
      );
      this.terminal.loadAddon(this.modelSessionAddon);
    }
  }

  dispose() {
    this.disposed = true;
    for (const disposable of this.integrationDisposables) {
      disposable.dispose();
    }
    this.integrationDisposables.length = 0;
    this.resizeObserver.disconnect();
    if (this.fitAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.fitAnimationFrame);
      this.fitAnimationFrame = undefined;
    }
    if (this.themeRefreshAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.themeRefreshAnimationFrame);
      this.themeRefreshAnimationFrame = undefined;
    }
    this.terminal.dispose();
    this.terminalContainer.remove();
  }

  /**
   * Runs a command through the real prompt, so it lands in shell history and
   * produces a normal block just like something the user typed.
   */
  executeCommand(command: string) {
    if (!this.shellIntegrationAddon) {
      return Promise.reject(new Error("终端未启用 shell 集成，无法执行命令"));
    }

    return this.shellIntegrationAddon.executeCommand(command);
  }

  setThemeTokens(tokens: TerminalThemeTokenOverrides) {
    this.terminalThemeTokens = {
      ...this.terminalThemeTokens,
      ...tokens,
      ansi: {
        ...this.terminalThemeTokens.ansi,
        ...tokens.ansi,
      },
    };
    applyTerminalThemeTokens(this.terminalContainer, tokens);
    this.refreshTheme();
  }

  resetTheme() {
    this.terminalThemeTokens = {};
    clearTerminalThemeTokens(this.terminalContainer);
    this.refreshTheme();
  }

  refreshTheme() {
    syncTerminalTheme(
      this.terminal,
      this.terminalContainer,
      this.terminalThemeTokens.ansi,
    );
  }

  refreshLocale() {
    this.agentPromptAddon?.refreshLocale();
    this.blockAddon?.refreshLocale();
    this.subshellAddon?.refreshLocale();
    this.modelSessionAddon?.refreshLocale();
  }

  /** Refit xterm after an inline card reflows without resizing its transport. */
  refreshForContentLayout() {
    this.scheduleFit(false);
  }

  shouldNotifyTransportResize() {
    return !this.isFittingContentLayout
      && !(this.inputRouterAddon?.isAgentRequestInFlight() ?? false);
  }

  private scheduleThemeRefresh() {
    if (this.disposed) {
      return;
    }
    if (this.themeRefreshAnimationFrame !== undefined) {
      return;
    }

    this.themeRefreshAnimationFrame = window.requestAnimationFrame(() => {
      this.themeRefreshAnimationFrame = undefined;
      if (this.disposed) {
        return;
      }
      this.refreshTheme();
    });
  }

  private scheduleFit(shouldNotifyTransport = true) {
    if (this.disposed) {
      return;
    }
    this.fitShouldNotifyTransport ||= shouldNotifyTransport;
    if (this.fitAnimationFrame !== undefined) {
      return;
    }

    this.fitAnimationFrame = window.requestAnimationFrame(() => {
      this.fitAnimationFrame = undefined;
      const notifyTransport = this.fitShouldNotifyTransport;
      this.fitShouldNotifyTransport = false;
      this.fitTerminalToContainer(notifyTransport);
    });
  }

  private fitTerminalToContainer(shouldNotifyTransport: boolean) {
    if (this.disposed || !this.terminalContainer.isConnected) {
      return;
    }

    const terminalElement = this.terminal.element;
    if (!terminalElement?.isConnected) {
      return;
    }

    const { width, height } = this.terminalContainer.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
      return;
    }

    this.isFittingContentLayout = !shouldNotifyTransport;
    try {
      this.fitAddon.fit();
      if (!shouldNotifyTransport) {
        this.terminal.refresh(0, this.terminal.rows - 1);
      }
    } catch (error) {
      if (!this.isMissingRenderDimensionsError(error)) {
        throw error;
      }
    } finally {
      this.isFittingContentLayout = false;
    }
  }

  private isMissingRenderDimensionsError(error: unknown) {
    return (
      error instanceof TypeError &&
      typeof error.message === "string" &&
      error.message.includes("dimensions")
    );
  }

  private guardViewportSyncScrollArea() {
    const terminalWithViewport = (
      this.terminal as XTerminal & {
        viewport?: {
          syncScrollArea: (immediate?: boolean, force?: boolean) => void;
        };
        _core?: {
          viewport?: {
            syncScrollArea: (immediate?: boolean, force?: boolean) => void;
          };
        };
      }
    );
    const viewport =
      terminalWithViewport.viewport ?? terminalWithViewport._core?.viewport;

    if (!viewport) {
      return;
    }

    const syncScrollArea = viewport.syncScrollArea.bind(viewport);
    viewport.syncScrollArea = (immediate?: boolean, force?: boolean) => {
      if (this.disposed || !this.terminalContainer.isConnected) {
        return;
      }

      try {
        syncScrollArea(immediate, force);
      } catch (error) {
        if (!this.isMissingRenderDimensionsError(error)) {
          throw error;
        }
      }
    };
  }

  private createTerminalContainer(container: HTMLElement) {
    const terminalContainer = document.createElement("div");

    container.classList.add("ai-terminal-container");
    terminalContainer.classList.add("ai-terminal-viewport");
    terminalContainer.style.position = "relative";
    terminalContainer.style.width = "100%";
    terminalContainer.style.height = "100%";

    container.appendChild(terminalContainer);

    return terminalContainer;
  }

  private normalizeAgentPromptOptions(
    agentPrompt: string | AgentPromptAddonOptions,
  ): AgentPromptAddonOptions {
    return typeof agentPrompt === "string"
      ? { text: agentPrompt }
      : agentPrompt;
  }

  /**
   * Fans the shell integration events out to the addons that depend on them.
   *
   * This is the seam that used to be the local-echo addon's internal state: the
   * shell reports where prompts and commands begin, and everything prompt-aware
   * reacts to that instead of to a locally rendered prompt string.
   */
  private connectShellIntegration() {
    const integration = this.shellIntegrationAddon;
    if (!integration) {
      return;
    }

    this.integrationDisposables.push(
      integration.commandFinish.on((block) => {
        // Disabled: Don't render block frames to keep terminal clean
        // this.blockAddon?.addBlock(block);
        // Add explain button for commands with output
        this.blockAddon?.addExplainButton(block);
        // Anchor pending AI sessions after command output completes
        this.modelSessionAddon?.anchorPendingSessions();
      }),
      integration.subshellDetected.on((detection) => {
        this.subshellAddon?.handleDetection(detection);
      }),
      integration.promptStart.on(() => {
        // Back at a prompt that reports itself, so any pending offer is moot.
        this.subshellAddon?.hide();
        this.modelSessionAddon?.anchorPreparedSession();
        this.inputRouterAddon?.notifyInputState();
      }),
      integration.stateChange.on(() => {
        this.inputRouterAddon?.notifyInputState();
      }),
    );
  }

  private connectFullscreenVisibility() {
    this.setFullscreenMode(
      this.terminal.buffer.active.type === "alternate",
    );
    this.integrationDisposables.push(
      this.terminal.buffer.onBufferChange((buffer) => {
        this.setFullscreenMode(buffer.type === "alternate");
      }),
    );
  }

  private setFullscreenMode(enabled: boolean) {
    this.terminalContainer.classList.toggle(
      "ai-terminal-fullscreen-mode",
      enabled,
    );
  }

  private normalizeModelSessionOptions(
    modelSession: boolean | ModelSessionAddonOptions,
  ): ModelSessionAddonOptions {
    return typeof modelSession === "boolean"
      ? { enabled: modelSession }
      : modelSession;
  }
}
