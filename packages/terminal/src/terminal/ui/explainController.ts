import {
  createChatTerminalI18n,
  type ChatTerminalI18n,
  type ChatTerminalMessageKey,
} from "../i18n";
import type { CommandExplain } from "../types/explain";
import type {
  ExplainDialogOptions,
  ExplainDialogPosition,
  ExplainDialogState,
} from "../types/ui";
import { getTerminalElementInsets } from "../utils";
import { createExplainDialog, renderExplainDialog } from "./explainDialog";

const DIALOG_WIDTH = 400;
const DIALOG_MAX_HEIGHT = 180;
const DIALOG_MARGIN = 12;
const DIALOG_ANCHOR_OFFSET_Y = 8;
const RENDER_INTERVAL_MS = 50;

export interface ExplainAnchor {
  left: number;
  top: number;
  size: number;
}

export interface ExplainControllerOptions {
  /** Element the dialog is appended to, resolved lazily. */
  host: () => HTMLElement | undefined;
  onExplain: CommandExplain;
  onCancel?: (signal: AbortSignal) => void | Promise<void>;
  i18n?: ChatTerminalI18n;
  explainTitle?: string;
}

interface ActiveDialog {
  contentKey?: ChatTerminalMessageKey;
  element: HTMLElement;
  options: ExplainDialogOptions;
  state: ExplainDialogState;
}

/**
 * Owns the streaming "explain this output" dialog.
 *
 * Extracted from the local-echo addon so the block action bar can reuse the same
 * streaming, abort and repositioning behaviour instead of reimplementing it.
 */
export class ExplainController {
  private readonly i18n: ChatTerminalI18n;
  private requestVersion = 0;
  private abortController?: AbortController;
  private renderTimer?: number;
  private pendingCancellation?: Promise<void>;
  private currentDialog?: HTMLElement;
  private activeDialog?: ActiveDialog;
  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (
      this.currentDialog &&
      target instanceof Node &&
      !this.currentDialog.contains(target)
    ) {
      this.close();
    }
  };

  constructor(private readonly options: ExplainControllerOptions) {
    this.i18n = options.i18n ?? createChatTerminalI18n();
  }

  async open(command: string, output: string, anchor: ExplainAnchor) {
    const host = this.options.host();
    if (!host) {
      return;
    }

    this.close();

    const position = this.resolvePosition(anchor, host);
    const state: ExplainDialogState = {
      status: "loading",
      title: "",
      content: "",
    };
    const dialogOptions: ExplainDialogOptions = {
      onClose: () => this.close(),
      onRefresh: () => {
        void this.stream(dialog, command, output, position);
      },
      position,
    };
    const dialog = createExplainDialog(
      this.localize(state, "explainLoading"),
      dialogOptions,
    );

    host.appendChild(dialog);
    this.currentDialog = dialog;
    this.activeDialog = {
      contentKey: "explainLoading",
      element: dialog,
      options: dialogOptions,
      state,
    };
    document.addEventListener("pointerdown", this.handleDocumentPointerDown);

    await this.stream(dialog, command, output, position);
  }

  close() {
    if (!this.currentDialog) {
      return;
    }

    void this.cancelActiveRequest();
    this.requestVersion += 1;
    this.currentDialog.remove();
    this.currentDialog = undefined;
    this.activeDialog = undefined;
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
  }

  refreshLocale() {
    if (!this.activeDialog) {
      return;
    }

    this.render(this.activeDialog);
  }

  dispose() {
    this.close();
    this.requestVersion += 1;
    this.cancel();
  }

  private cancel() {
    this.abortController?.abort();
    this.abortController = undefined;
    this.clearRenderTimer();
  }

  private cancelActiveRequest() {
    const signal = this.abortController?.signal;
    this.cancel();
    if (!signal || !this.options.onCancel) {
      return this.pendingCancellation ?? Promise.resolve();
    }

    const cancel = async () => {
      try {
        await this.options.onCancel?.(signal);
      } catch {
        // Closing the dialog must not be blocked by a failed stop request.
      }
    };
    const previous = this.pendingCancellation ?? Promise.resolve();
    const next = previous.then(cancel, cancel);
    let pending: Promise<void>;
    pending = next.finally(() => {
      if (this.pendingCancellation === pending) {
        this.pendingCancellation = undefined;
      }
    });
    this.pendingCancellation = pending;
    return pending;
  }

  private clearRenderTimer() {
    if (this.renderTimer === undefined) {
      return;
    }

    window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
  }

  private render(dialog: ActiveDialog) {
    renderExplainDialog(
      dialog.element,
      this.localize(dialog.state, dialog.contentKey),
      dialog.options,
    );
  }

  private localize(
    state: ExplainDialogState,
    contentKey?: ChatTerminalMessageKey,
  ): ExplainDialogState {
    return {
      ...state,
      title: this.options.explainTitle ?? this.i18n.t("explainTitle"),
      content: contentKey ? this.i18n.t(contentKey) : state.content,
    };
  }

  private isCurrent(dialog: HTMLElement, requestVersion: number) {
    return (
      this.currentDialog === dialog &&
      this.requestVersion === requestVersion &&
      dialog.isConnected
    );
  }

  private async stream(
    dialog: HTMLElement,
    command: string,
    output: string,
    position: ExplainDialogPosition,
  ) {
    await this.cancelActiveRequest();
    const requestVersion = ++this.requestVersion;
    const abortController = new AbortController();
    this.abortController = abortController;

    const dialogOptions: ExplainDialogOptions = {
      onClose: () => this.close(),
      onRefresh: () => {
        void this.stream(dialog, command, output, position);
      },
      position,
    };
    this.activeDialog = {
      contentKey: "explainLoading",
      element: dialog,
      options: dialogOptions,
      state: { status: "loading", title: "", content: "" },
    };
    this.render(this.activeDialog);

    let content = "";
    let lastRenderAt = 0;
    const renderStreaming = () => {
      this.renderTimer = undefined;
      if (!this.isCurrent(dialog, requestVersion)) {
        return;
      }

      lastRenderAt = Date.now();
      this.activeDialog = {
        element: dialog,
        options: dialogOptions,
        state: { status: "streaming", title: "", content, markdown: true },
      };
      this.render(this.activeDialog);
    };

    try {
      const finalContent = await this.options.onExplain(
        { command, output },
        {
          onChunk: (delta) => {
            if (
              !delta ||
              abortController.signal.aborted ||
              !this.isCurrent(dialog, requestVersion)
            ) {
              return;
            }

            content += delta;
            const delay = Math.max(0, RENDER_INTERVAL_MS - (Date.now() - lastRenderAt));
            if (delay === 0) {
              renderStreaming();
            } else if (this.renderTimer === undefined) {
              this.renderTimer = window.setTimeout(renderStreaming, delay);
            }
          },
          signal: abortController.signal,
        },
      );
      content = finalContent || content;

      this.clearRenderTimer();
      if (!this.isCurrent(dialog, requestVersion)) {
        return;
      }

      this.activeDialog = {
        contentKey: content ? undefined : "explainEmpty",
        element: dialog,
        options: dialogOptions,
        state: {
          status: "success",
          title: "",
          content,
          markdown: content.length > 0,
        },
      };
      this.render(this.activeDialog);
    } catch (error) {
      this.clearRenderTimer();
      if (abortController.signal.aborted || isAbortError(error)) {
        return;
      }
      if (!this.isCurrent(dialog, requestVersion)) {
        return;
      }

      const message = error instanceof Error ? error.message : undefined;
      this.activeDialog = {
        contentKey: message || content ? undefined : "explainFailed",
        element: dialog,
        options: dialogOptions,
        state: {
          status: "error",
          title: "",
          content: content
            ? `${content}\n\n> ${this.i18n.t("explainInterrupted")}：${
                message ?? this.i18n.t("explainFailed")
              }`
            : (message ?? ""),
          markdown: content.length > 0,
        },
      };
      this.render(this.activeDialog);
    } finally {
      if (this.abortController === abortController) {
        this.abortController = undefined;
      }
    }
  }

  /** Places the dialog next to the anchor, flipping above it when short of room. */
  private resolvePosition(
    anchor: ExplainAnchor,
    host: HTMLElement,
  ): ExplainDialogPosition {
    const insets = getTerminalElementInsets(host);
    const containerWidth = Math.max(
      DIALOG_WIDTH,
      (host.clientWidth || DIALOG_WIDTH) - insets.right,
    );
    const containerHeight = Math.max(
      DIALOG_MAX_HEIGHT,
      (host.clientHeight || DIALOG_MAX_HEIGHT) - insets.bottom,
    );
    const maxLeft = Math.max(
      DIALOG_MARGIN,
      containerWidth - DIALOG_WIDTH - DIALOG_MARGIN,
    );
    const belowTop = anchor.top + anchor.size + DIALOG_ANCHOR_OFFSET_Y;
    const belowSpace = containerHeight - belowTop - DIALOG_MARGIN;
    const placeAbove = belowSpace < DIALOG_MAX_HEIGHT;
    const preferredTop = placeAbove
      ? anchor.top - DIALOG_MAX_HEIGHT - DIALOG_ANCHOR_OFFSET_Y
      : belowTop;
    const maxTop = Math.max(
      DIALOG_MARGIN,
      containerHeight - DIALOG_MAX_HEIGHT - DIALOG_MARGIN,
    );

    return {
      left: clamp(anchor.left + anchor.size / 2 - DIALOG_WIDTH / 2, DIALOG_MARGIN, maxLeft),
      top: clamp(preferredTop, DIALOG_MARGIN, maxTop),
      ...(placeAbove ? { height: DIALOG_MAX_HEIGHT } : {}),
    };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
