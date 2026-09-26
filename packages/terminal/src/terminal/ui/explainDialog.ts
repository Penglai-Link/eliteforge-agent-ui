import { html, render } from "lit-html";
import type { ExplainDialogOptions, ExplainDialogState } from "../types/ui";
import { renderMarkdown } from "../utils/markdown";

export function createExplainDialog(
  state: ExplainDialogState,
  options: ExplainDialogOptions,
) {
  const host = document.createElement("div");
  host.className = "ai-terminal-explain-dialog-host";
  const stopTerminalScroll = (event: Event) => {
    event.stopPropagation();
  };
  host.addEventListener("mousedown", stopTerminalScroll);
  host.addEventListener("wheel", stopTerminalScroll);
  host.addEventListener("touchmove", stopTerminalScroll);
  renderExplainDialog(host, state, options);

  return host;
}

export function renderExplainDialog(
  host: HTMLElement,
  state: ExplainDialogState,
  options: ExplainDialogOptions,
) {
  const renderAsMarkdown = state.markdown === true;
  const heightStyle = options.position.height
    ? `height:${options.position.height}px;`
    : "";
  render(
    html`
      <section
        class=${`ai-terminal-explain-dialog ai-terminal-explain-dialog--${state.status}`}
        style=${`--ai-terminal-explain-dialog-left:${options.position.left}px;--ai-terminal-explain-dialog-top:${options.position.top}px;${heightStyle}`}
        aria-live="polite"
      >
        <header class="ai-terminal-explain-dialog__header">
          <h2 class="ai-terminal-explain-dialog__title">${state.title}</h2>
          <div class="ai-terminal-explain-dialog__actions">
            <button
              class="ai-terminal-explain-dialog__icon-button"
              type="button"
              @click=${options.onRefresh}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              class="ai-terminal-explain-dialog__icon-button"
              type="button"
              @click=${options.onClose}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="lucide lucide-x-icon lucide-x"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div
          class=${`ai-terminal-explain-dialog__content ${
            renderAsMarkdown ? "ai-terminal-markdown" : ""
          }`}
        >
          ${state.status === "loading"
            ? html`<span class="ai-terminal-explain-dialog__loading-text">${state.content}</span>`
            : renderAsMarkdown
              ? renderMarkdown(state.content)
              : state.content}
        </div>
      </section>
    `,
    host,
  );
}
