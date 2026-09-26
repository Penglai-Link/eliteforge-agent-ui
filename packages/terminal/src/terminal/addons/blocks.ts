import type {
  IDecoration,
  IDisposable,
  ITerminalAddon,
  Terminal as XTerminal,
} from "@xterm/xterm";

import { createChatTerminalI18n, type ChatTerminalI18n } from "../i18n";
import type { BlockActionKey, BlockAddonOptions } from "../types/blocks";
import type { TerminalCommandBlock } from "../types/shellIntegration";
import { getTerminalCellMetrics, getTerminalElementInsets } from "../utils";
import { ExplainController } from "../ui/explainController";
import { createBlockActionBar, type BlockActionBar } from "../ui/blockActionBar";
import { createExplainButton } from "../ui/explainButton";

const DEFAULT_MAX_RENDERED_BLOCKS = 80;
const SSH_COMMAND = /(?:^|\s)(?:[\w./-]+\/)?ssh(?:\s|$)/;

interface RenderedBlock {
  block: TerminalCommandBlock;
  decoration?: IDecoration;
  explainButtonDecoration?: IDecoration;
  explainButtonElement?: HTMLElement;
}

/**
 * Renders each finished command as a Warp-style block.
 *
 * A block frame is drawn on the decoration layer beneath the text, so the shell
 * output itself is still rendered by xterm; hovering a block reveals a single
 * shared action bar rather than one element per block, which keeps the DOM flat
 * even after hundreds of commands.
 */
export class BlockAddon implements ITerminalAddon {
  private terminal?: XTerminal;
  private readonly disposables: IDisposable[] = [];
  private readonly rendered: RenderedBlock[] = [];
  private readonly i18n: ChatTerminalI18n;
  private readonly explain: ExplainController;
  private actionBar?: BlockActionBar;
  private hoveredBlockId?: string;
  private screenElement?: HTMLElement;

  private readonly handlePointerMove = (event: PointerEvent) => {
    this.updateHoveredBlock(event.clientY);
  };
  private readonly handlePointerLeave = () => {
    this.hideActionBar();
  };

  constructor(private readonly options: BlockAddonOptions = {}) {
    this.i18n = options.i18n ?? createChatTerminalI18n();
    this.explain = new ExplainController({
      host: () => this.terminal?.element ?? undefined,
      i18n: this.i18n,
      explainTitle: options.explainTitle,
      onCancel: options.onExplainCancel,
      onExplain: (payload, context) => {
        if (!options.onExplain) {
          return Promise.resolve("");
        }
        return options.onExplain(payload, context);
      },
    });
  }

  activate(terminal: XTerminal) {
    this.terminal = terminal;
    this.screenElement =
      terminal.element?.querySelector<HTMLElement>(".xterm-screen") ??
      terminal.element ??
      undefined;

    this.actionBar = createBlockActionBar({
      i18n: this.i18n,
      canExplain: Boolean(this.options.onExplain),
      canAsk: Boolean(this.options.onAskAgent),
      canRerun: Boolean(this.options.onRerun),
      onAction: (action) => this.runAction(action),
    });
    terminal.element?.appendChild(this.actionBar.element);

    const host = this.screenElement;
    host?.addEventListener("pointermove", this.handlePointerMove);
    terminal.element?.addEventListener("pointerleave", this.handlePointerLeave);

    this.disposables.push(
      terminal.onScroll(() => this.repositionActionBar()),
      terminal.onResize(() => this.hideActionBar()),
      {
        dispose: () => {
          host?.removeEventListener("pointermove", this.handlePointerMove);
          terminal.element?.removeEventListener(
            "pointerleave",
            this.handlePointerLeave,
          );
        },
      },
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    for (const entry of this.rendered) {
      entry.decoration?.dispose();
      entry.explainButtonDecoration?.dispose();
      entry.explainButtonElement?.remove();
    }
    this.rendered.length = 0;
    this.explain.dispose();
    this.actionBar?.element.remove();
    this.actionBar = undefined;
    this.hoveredBlockId = undefined;
    this.screenElement = undefined;
    this.terminal = undefined;
  }

  refreshLocale() {
    this.explain.refreshLocale();
    this.actionBar?.refreshLocale();
  }

  /** Adds an explain button for a finished command. */
  addExplainButton(block: TerminalCommandBlock) {
    const terminal = this.terminal;
    if (!terminal || !this.options.onExplain || !block.command.trim()) {
      return;
    }

    // The shell reports this marker after the prompt and before the command
    // text. It survives SSH login output, unlike the prompt and output markers.
    const marker =
      block.commandMarker ?? block.promptMarker ?? block.outputMarker;
    if (!marker || block.startLine < 0) {
      return;
    }

    // The command line is at the marker's line
    const commandLine = marker.line;
    const buffer = terminal.buffer.active;
    let commandEndColumn =
      block.commandStartColumn === undefined
        ? 0
        : block.commandStartColumn + block.command.length;

    if (commandLine >= 0 && commandLine < buffer.length) {
      const line = buffer.getLine(commandLine);
      if (line) {
        const lineText = line.translateToString(false);

        // The outer SSH invocation is a transport/login command. Its output
        // is a mixture of banners, authentication prompts and the remote
        // session, so there is no single useful command location for a button.
        // Check both the reported command and the rendered marker row because
        // either can contain terminal-control bytes or stale shell metadata.
        if (SSH_COMMAND.test(block.command) || SSH_COMMAND.test(lineText)) {
          return;
        }

        // The rendered command is the source of truth. Shell-reported columns
        // can be stale when a prompt is redrawn or an SSH session echoes the
        // command on a different cursor position.
        const commandIndex = lineText.indexOf(
          block.command,
          block.commandStartColumn ?? 0,
        );

        if (commandIndex >= 0) {
          commandEndColumn = commandIndex + block.command.length;
        } else if (block.commandStartColumn !== undefined) {
          // Older/injected shells may not leave the command in the marker row.
          commandEndColumn = block.commandStartColumn + block.command.length;
        } else {
          // Last resort for blocks without either a command column or an exact
          // command echo: put the button after the visible content.
          commandEndColumn = lineText.trimEnd().length;
        }
      }
    }

    // Create a decoration at the command line, after the command text
    const decoration = terminal.registerDecoration({
      marker,
      anchor: "left",
      x: commandEndColumn,
      width: 1,
      height: 1,
      layer: "top",
    });

    if (!decoration) {
      return;
    }

    const cell = getTerminalCellMetrics(terminal);
    const buttonSize = Math.max(14, cell.height - 2);

    const host = createExplainButton({
      left: 10,
      top: 1,
      size: buttonSize,
      onClick: () => {
        void this.openExplainForBlock(block, decoration, commandEndColumn);
      },
    });

    const mountButton = (element: HTMLElement) => {
      element.style.pointerEvents = "auto";
      element.style.overflow = "visible";
      if (host.parentElement !== element) {
        element.appendChild(host);
      }
    };

    decoration.onRender(mountButton);
    if (decoration.element) {
      mountButton(decoration.element);
    }

    // Store the decoration and element for cleanup
    const entry = this.rendered.find((e) => e.block.id === block.id);
    if (entry) {
      entry.explainButtonDecoration = decoration;
      entry.explainButtonElement = host;
    }
  }

  private async openExplainForBlock(
    block: TerminalCommandBlock,
    buttonDecoration: IDecoration,
    buttonColumn: number,
  ) {
    const terminal = this.terminal;
    const terminalElement = terminal?.element;
    if (!terminal || !terminalElement) {
      return;
    }

    const cell = getTerminalCellMetrics(terminal);
    const insets = getTerminalElementInsets(terminalElement);
    const markerLine = buttonDecoration.marker.line;

    // Calculate button position in viewport
    const viewportY = terminal.buffer.active.viewportY;
    const buttonTop = Math.max(
      0,
      insets.top + (markerLine - viewportY) * cell.height,
    );
    const buttonLeft = insets.left + buttonColumn * cell.width + 10; // 10 is the left offset from createExplainButton
    const buttonSize = Math.max(14, cell.height - 2);

    // Pass the button anchor to explain controller
    // It will calculate the dialog position based on available space
    await this.explain.open(block.command, block.readOutput(), {
      left: buttonLeft,
      top: buttonTop,
      size: buttonSize,
    });
  }

  /** Draws the frame for a finished command. */
  addBlock(block: TerminalCommandBlock) {
    const terminal = this.terminal;
    if (!terminal) {
      return;
    }

    const marker = block.promptMarker ?? block.outputMarker;
    const startLine = block.startLine;
    const endLine = block.endLine;
    // A command with no output at all, or a block whose rows were already
    // trimmed from the scrollback, has nothing worth framing.
    if (!marker || startLine < 0 || endLine < startLine) {
      return;
    }

    const decoration = terminal.registerDecoration({
      marker,
      width: terminal.cols,
      height: endLine - startLine + 1,
      layer: "bottom",
      x: 0,
    });

    const entry: RenderedBlock = { block, decoration: decoration ?? undefined };
    const paint = (element: HTMLElement) => {
      element.classList.add("ai-terminal-block");
      element.classList.toggle(
        "ai-terminal-block--failed",
        typeof block.exitCode === "number" && block.exitCode !== 0,
      );
      // The frame sits under the text; hovering is detected on the screen
      // element instead, so it must not swallow selection or clicks.
      element.style.pointerEvents = "none";
    };

    decoration?.onRender(paint);
    if (decoration?.element) {
      paint(decoration.element);
    }

    this.rendered.push(entry);
    this.evictOldBlocks();
  }

  private evictOldBlocks() {
    const limit = this.options.maxRenderedBlocks ?? DEFAULT_MAX_RENDERED_BLOCKS;
    while (this.rendered.length > limit) {
      const evicted = this.rendered.shift();
      evicted?.decoration?.dispose();
      evicted?.explainButtonDecoration?.dispose();
      evicted?.explainButtonElement?.remove();
      if (evicted && evicted.block.id === this.hoveredBlockId) {
        this.hideActionBar();
      }
    }
  }

  private findBlockAtRow(row: number) {
    // Newest first: later blocks are the ones a user is most likely aiming at.
    for (let index = this.rendered.length - 1; index >= 0; index -= 1) {
      const { block } = this.rendered[index];
      const start = block.startLine;
      const end = block.endLine;
      if (start >= 0 && end >= start && row >= start && row <= end) {
        return block;
      }
    }

    return undefined;
  }

  private hoveredBlock() {
    if (!this.hoveredBlockId) {
      return undefined;
    }

    return this.rendered.find((entry) => entry.block.id === this.hoveredBlockId)
      ?.block;
  }

  private updateHoveredBlock(clientY: number) {
    const terminal = this.terminal;
    const host = this.screenElement;
    if (!terminal || !host || !this.actionBar) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const offsetY = clientY - rect.top;
    if (offsetY < 0 || offsetY > rect.height) {
      this.hideActionBar();
      return;
    }

    const cell = getTerminalCellMetrics(terminal);
    const row =
      Math.floor(offsetY / cell.height) + terminal.buffer.active.viewportY;
    const block = this.findBlockAtRow(row);
    if (!block) {
      this.hideActionBar();
      return;
    }
    if (block.id === this.hoveredBlockId) {
      return;
    }

    this.hoveredBlockId = block.id;
    this.showActionBar(block);
  }

  private showActionBar(block: TerminalCommandBlock, copied = false) {
    const terminal = this.terminal;
    const terminalElement = terminal?.element;
    if (!terminal || !terminalElement || !this.actionBar) {
      return;
    }

    const cell = getTerminalCellMetrics(terminal);
    const insets = getTerminalElementInsets(terminalElement);
    const top = Math.max(
      0,
      insets.top + (block.startLine - terminal.buffer.active.viewportY) * cell.height,
    );
    this.actionBar.show({ exitCode: block.exitCode, top, copied });
  }

  private repositionActionBar() {
    const terminal = this.terminal;
    if (!terminal || !this.actionBar?.isVisible()) {
      return;
    }

    const block = this.hoveredBlock();
    if (!block) {
      this.hideActionBar();
      return;
    }

    const viewportY = terminal.buffer.active.viewportY;
    const scrolledOut =
      block.endLine < viewportY || block.startLine > viewportY + terminal.rows;
    if (scrolledOut) {
      this.hideActionBar();
      return;
    }

    this.showActionBar(block);
  }

  private hideActionBar() {
    this.actionBar?.hide();
    this.hoveredBlockId = undefined;
  }

  private runAction(action: BlockActionKey) {
    const block = this.hoveredBlock();
    if (!block) {
      return;
    }

    switch (action) {
      case "explain":
        void this.openExplain(block);
        break;
      case "ask":
        void this.options.onAskAgent?.(block);
        break;
      case "copy":
        void this.copyBlock(block);
        break;
      case "rerun":
        void this.options.onRerun?.(block.command);
        break;
    }
  }

  private async openExplain(block: TerminalCommandBlock) {
    const terminal = this.terminal;
    const terminalElement = terminal?.element;
    if (!terminal || !terminalElement || !this.options.onExplain) {
      return;
    }

    const cell = getTerminalCellMetrics(terminal);
    const insets = getTerminalElementInsets(terminalElement);
    const top = Math.max(
      0,
      insets.top + (block.startLine - terminal.buffer.active.viewportY) * cell.height,
    );
    await this.explain.open(block.command, block.readOutput(), {
      left: terminalElement.clientWidth - insets.right,
      size: cell.height,
      top,
    });
  }

  private async copyBlock(block: TerminalCommandBlock) {
    const text = `${block.command}\n${block.readOutput()}`.trim();

    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("Terminal block could not be copied", error);
      return;
    }

    this.showActionBar(block, true);
    window.setTimeout(() => {
      const current = this.hoveredBlock();
      if (current?.id === block.id && this.actionBar?.isVisible()) {
        this.showActionBar(block);
      }
    }, COPY_FEEDBACK_MS);
  }
}

const COPY_FEEDBACK_MS = 1_200;
