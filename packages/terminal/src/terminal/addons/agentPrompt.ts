import {
  Terminal as XTerminal,
  type IDecoration,
  type IDisposable,
  type IMarker,
  type ITerminalAddon,
} from "@xterm/xterm";
import type { AgentPromptAddonOptions } from "../types/agentPrompt";

const PROMPT_RESIZE_DEBOUNCE_MS = 100;
const CURSOR_HIDE_SEQUENCE = "\x1b[?25l";
const CURSOR_SHOW_SEQUENCE = "\x1b[?25h";

export class AgentPromptAddon implements ITerminalAddon {
  private disposables: IDisposable[] = [];
  private decoration?: IDecoration;
  private marker?: IMarker;
  private terminal?: XTerminal;
  private positionAnimationFrame?: number;
  private resizeDebounceTimer?: number;
  private resizeSuppressed = false;
  private inputEnabled = true;
  private hasInput = false;
  private pendingInput = "";
  private pendingInputDirty = false;
  private isInputStateManaged = false;
  private standaloneInput = "";
  private visible = true;
  private modelSessionActive = false;
  private cursorHidden = false;
  private cursorWasFocused = false;
  private previousCursorInactiveStyle?: XTerminal["options"]["cursorInactiveStyle"];

  constructor(private readonly options: AgentPromptAddonOptions) {}

  activate(terminal: XTerminal) {
    if (!terminal.element) {
      throw new Error("AgentPromptAddon must be loaded after terminal.open().");
    }

    this.terminal = terminal;
    terminal.element.addEventListener("focusin", this.handleTerminalFocusIn);
    this.bindTracking(terminal);
    this.syncVisibility();
    this.updateDecoration();
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.disposables = [];
    if (this.positionAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.positionAnimationFrame);
      this.positionAnimationFrame = undefined;
    }
    if (this.resizeDebounceTimer !== undefined) {
      window.clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = undefined;
    }
    this.resizeSuppressed = false;
    this.disposeDecoration();
    this.terminal?.element?.removeEventListener(
      "focusin",
      this.handleTerminalFocusIn,
    );
    this.setCursorHidden(false, false);
    this.terminal?.element?.classList.remove("ai-terminal-input-disabled");
    this.terminal = undefined;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.schedulePositionUpdate();
  }

  setModelSessionActive(active: boolean) {
    this.modelSessionActive = active;
    this.syncVisibility();
  }

  refreshLocale() {
    this.mountPrompt(this.decoration?.element);
  }

  setInputState(
    enabled: boolean,
    input: string,
    options: { hideCursor?: boolean } = {},
  ) {
    this.isInputStateManaged = true;
    this.inputEnabled = enabled;
    if (!enabled || options.hideCursor) {
      this.pendingInput = "";
      this.pendingInputDirty = false;
      this.hasInput = input.length > 0;
    } else if (this.pendingInputDirty) {
      if (input === this.pendingInput) {
        this.pendingInputDirty = false;
      }
      this.hasInput = this.pendingInput.length > 0;
    } else if (input.length > 0) {
      this.pendingInput = input;
      this.hasInput = true;
    } else {
      this.hasInput = this.pendingInput.length > 0;
    }
    const hideCursor = options.hideCursor ?? !enabled;
    this.terminal?.element?.classList.toggle(
      "ai-terminal-input-disabled",
      hideCursor,
    );
    this.setCursorHidden(hideCursor);
    this.syncVisibility();
  }

  private readonly handleTerminalFocusIn = () => {
    if (this.cursorHidden) {
      this.terminal?.blur();
    }
  };

  private setCursorHidden(hidden: boolean, restoreFocus = true) {
    const terminal = this.terminal;
    if (!terminal || this.cursorHidden === hidden) {
      return;
    }

    if (hidden) {
      this.cursorHidden = true;
      this.cursorWasFocused = Boolean(
        terminal.element?.contains(terminal.element.ownerDocument.activeElement),
      );
      this.previousCursorInactiveStyle = terminal.options.cursorInactiveStyle;
      terminal.options.cursorInactiveStyle = "none";
      terminal.write(CURSOR_HIDE_SEQUENCE);
      terminal.blur();
      return;
    }

    const shouldRestoreFocus = restoreFocus && this.cursorWasFocused;
    terminal.write(CURSOR_SHOW_SEQUENCE);
    terminal.options.cursorInactiveStyle = this.previousCursorInactiveStyle;
    this.cursorHidden = false;
    this.cursorWasFocused = false;
    this.previousCursorInactiveStyle = undefined;
    if (shouldRestoreFocus) {
      terminal.focus();
    }
  }

  private getPromptText() {
    return (
      this.options.text ??
      this.options.i18n?.t(this.options.textKey ?? "agentTips") ??
      ""
    );
  }

  private bindTracking(terminal: XTerminal) {
    this.disposables.push(
      terminal.onCursorMove(() => {
        this.schedulePositionUpdate();
      }),
      terminal.onWriteParsed(() => {
        this.schedulePositionUpdate();
      }),
      terminal.onResize(() => {
        this.suppressDuringResize();
      }),
      terminal.onData((data) => {
        this.handleStandaloneInput(data);
      }),
    );
  }

  private handleStandaloneInput(data: string) {
    if (!this.inputEnabled) {
      return;
    }

    if (data === "\r") {
      this.standaloneInput = "";
      this.pendingInput = "";
      this.pendingInputDirty = true;
    } else if (data === "\u007f") {
      this.standaloneInput = Array.from(this.standaloneInput)
        .slice(0, -1)
        .join("");
      this.pendingInput = Array.from(this.pendingInput)
        .slice(0, -1)
        .join("");
      this.pendingInputDirty = true;
    } else if (!data.startsWith("\x1b")) {
      this.standaloneInput += data;
      this.pendingInput += data;
      this.pendingInputDirty = true;
    }

    this.hasInput = this.isInputStateManaged
      ? this.pendingInput.length > 0
      : this.standaloneInput.length > 0;
    this.syncVisibility();
  }

  private syncVisibility() {
    this.setVisible(!this.modelSessionActive && this.inputEnabled && !this.hasInput);
    this.schedulePositionUpdate();
  }

  private schedulePositionUpdate() {
    if (this.positionAnimationFrame !== undefined) {
      return;
    }

    this.positionAnimationFrame = window.requestAnimationFrame(() => {
      this.positionAnimationFrame = undefined;
      this.updateDecoration();
    });
  }

  private updateDecoration() {
    if (!this.terminal || !this.visible || this.resizeSuppressed) {
      this.disposeDecoration();
      return;
    }

    const buffer = this.terminal.buffer.active;
    const gapCells = this.options.gapCells ?? 1;
    const absoluteColumn = buffer.cursorX + gapCells;
    const rowOffset = Math.floor(absoluteColumn / this.terminal.cols);
    const column = absoluteColumn % this.terminal.cols;
    this.disposeDecoration();
    const marker = this.terminal.registerMarker(rowOffset);
    const decoration = this.terminal.registerDecoration({
      marker,
      anchor: "left",
      x: column,
      width: Math.max(1, this.terminal.cols - column),
      height: 1,
      layer: "top",
    });

    if (!decoration) {
      marker.dispose();
      return;
    }

    this.marker = marker;
    this.decoration = decoration;
    decoration.onRender((element) => {
      if (this.decoration === decoration) {
        this.mountPrompt(element);
      }
    });
    if (decoration.element) {
      this.mountPrompt(decoration.element);
    }
  }

  private mountPrompt(element?: HTMLElement) {
    if (!element || !this.terminal) {
      return;
    }

    element.classList.add("ai-terminal-agent-prompt");
    element.textContent = this.getPromptText();
    element.style.overflow = "visible";
    element.style.setProperty(
      "--ai-terminal-agent-prompt-color",
      this.options.color ?? "rgba(255, 255, 255, 0.48)",
    );
    element.style.setProperty(
      "--ai-terminal-agent-prompt-font-size",
      `${this.terminal.options.fontSize ?? 14}px`,
    );
  }

  private disposeDecoration() {
    const decoration = this.decoration;
    const marker = this.marker;

    this.decoration = undefined;
    this.marker = undefined;
    decoration?.dispose();
    marker?.dispose();
  }

  private suppressDuringResize() {
    this.resizeSuppressed = true;
    this.disposeDecoration();

    if (this.resizeDebounceTimer !== undefined) {
      window.clearTimeout(this.resizeDebounceTimer);
    }

    this.resizeDebounceTimer = window.setTimeout(() => {
      this.resizeDebounceTimer = undefined;
      this.resizeSuppressed = false;
      this.schedulePositionUpdate();
    }, PROMPT_RESIZE_DEBOUNCE_MS);
  }
}
