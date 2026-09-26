import { html, render } from "lit-html";

import type { ChatTerminalI18n } from "../i18n";

export interface SubshellPromptOptions {
  i18n: ChatTerminalI18n;
  onEnable: (remember: boolean) => void;
  onDismiss: (remember: boolean) => void;
}

export interface SubshellPrompt {
  element: HTMLElement;
  show(host: string): void;
  hide(): void;
  isVisible(): boolean;
  refreshLocale(): void;
}

/**
 * Asks before installing the shell integration into a shell the user opened
 * themselves, typically a remote one over SSH.
 *
 * Bootstrapping types a command into that shell, so it is never done silently;
 * the answer can be remembered per host.
 */
export function createSubshellPrompt(
  options: SubshellPromptOptions,
): SubshellPrompt {
  const element = document.createElement("div");
  element.className = "ai-terminal-subshell-prompt";
  element.hidden = true;
  element.setAttribute("role", "dialog");

  for (const eventName of ["mousedown", "wheel", "touchmove"]) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }

  let host = "";
  let remember = false;

  const paint = () => {
    const { i18n } = options;
    render(
      html`
        <p class="ai-terminal-subshell-prompt__title">
          ${i18n.t("subshellTitle")}
          ${host
            ? html`<span class="ai-terminal-subshell-prompt__host">（${host}）</span>`
            : null}
        </p>
        <p class="ai-terminal-subshell-prompt__description">
          ${i18n.t("subshellDescription")}
        </p>
        <label class="ai-terminal-subshell-prompt__remember">
          <input
            type="checkbox"
            .checked=${remember}
            @change=${(event: Event) => {
              remember = (event.target as HTMLInputElement).checked;
            }}
          />
          ${i18n.t("subshellRemember")}
        </label>
        <div class="ai-terminal-subshell-prompt__actions">
          <button
            class="ai-terminal-subshell-prompt__button"
            type="button"
            @click=${() => {
              element.hidden = true;
              options.onDismiss(remember);
            }}
          >
            ${i18n.t("subshellDismiss")}
          </button>
          <button
            class="ai-terminal-subshell-prompt__button ai-terminal-subshell-prompt__button--primary"
            type="button"
            @click=${() => {
              element.hidden = true;
              options.onEnable(remember);
            }}
          >
            ${i18n.t("subshellEnable")}
          </button>
        </div>
      `,
      element,
    );
  };

  return {
    element,
    show(nextHost) {
      host = nextHost;
      remember = false;
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
