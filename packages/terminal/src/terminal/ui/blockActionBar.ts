import { html, render } from "lit-html";

import type { ChatTerminalI18n } from "../i18n";
import type { BlockActionKey } from "../types/blocks";

export interface BlockActionBarOptions {
  i18n: ChatTerminalI18n;
  canExplain: boolean;
  canAsk: boolean;
  canRerun: boolean;
  onAction: (action: BlockActionKey) => void;
}

export interface BlockActionBarState {
  /** Null when the shell reported no status for the block. */
  exitCode: number | null;
  /** Distance from the top of the terminal viewport, in pixels. */
  top: number;
  /** Shows "copied" feedback in place of the copy label. */
  copied?: boolean;
}

export interface BlockActionBar {
  element: HTMLElement;
  show(state: BlockActionBarState): void;
  hide(): void;
  isVisible(): boolean;
  refreshLocale(): void;
}

/**
 * One action bar shared by every block, moved to whichever block is hovered.
 *
 * Keeping a single element means a session with hundreds of commands does not
 * accumulate hundreds of button groups in the DOM.
 */
export function createBlockActionBar(
  options: BlockActionBarOptions,
): BlockActionBar {
  const element = document.createElement("div");
  element.className = "ai-terminal-block-actions";
  element.hidden = true;
  element.setAttribute("role", "toolbar");

  // The bar floats over the terminal grid; without this, dragging across it
  // would start a text selection in xterm instead of pressing a button.
  for (const eventName of ["mousedown", "wheel", "touchmove"]) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }

  let state: BlockActionBarState = { exitCode: null, top: 0 };

  const paint = () => {
    const { i18n } = options;
    const failed = typeof state.exitCode === "number" && state.exitCode !== 0;
    element.setAttribute("aria-label", i18n.t("blockActions"));
    element.style.setProperty("--ai-terminal-block-actions-top", `${state.top}px`);
    element.classList.toggle("ai-terminal-block-actions--failed", failed);

    render(
      html`
        ${failed
          ? html`<span
              class="ai-terminal-block-actions__status"
              title=${`${i18n.t("blockExitCode")}: ${state.exitCode}`}
            >
              ${i18n.t("blockExitCode")} ${state.exitCode}
            </span>`
          : null}
        ${options.canExplain
          ? actionButton(i18n.t("blockExplain"), "explain", options.onAction)
          : null}
        ${options.canAsk
          ? actionButton(i18n.t("blockAsk"), "ask", options.onAction)
          : null}
        ${actionButton(
          state.copied ? i18n.t("blockCopied") : i18n.t("blockCopy"),
          "copy",
          options.onAction,
        )}
        ${options.canRerun
          ? actionButton(i18n.t("blockRerun"), "rerun", options.onAction)
          : null}
      `,
      element,
    );
  };

  return {
    element,
    show(next) {
      state = next;
      element.hidden = false;
      paint();
    },
    hide() {
      element.hidden = true;
    },
    isVisible() {
      return !element.hidden;
    },
    refreshLocale() {
      if (!element.hidden) {
        paint();
      }
    },
  };
}

function actionButton(
  label: string,
  action: BlockActionKey,
  onAction: (action: BlockActionKey) => void,
) {
  return html`<button
    class="ai-terminal-block-actions__button"
    type="button"
    @click=${(event: MouseEvent) => {
      event.stopPropagation();
      onAction(action);
    }}
  >
    ${label}
  </button>`;
}
